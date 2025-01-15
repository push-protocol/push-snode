import { Inject, Service } from 'typedi'
import { Logger } from 'winston'

import { Block } from '../../generated/push/block_pb'
import { BitUtil } from '../../utilz/bitUtil'
import { Check } from '../../utilz/check'
import { Coll } from '../../utilz/coll'
import { DateUtil } from '../../utilz/dateUtil'
import { SNodeInfoUtil } from '../../utilz/snodeInfoUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { Block as BlockClass } from '../block/block'
import { BlockPolling } from '../block/blockPolling'
import { BlockUtil } from '../messaging-common/blockUtil'
import { CronScheduler } from '../messaging-common/cronScheduler'
import {
  StorageContractListener,
  StorageContractState
} from '../messaging-common/storageContractState'
import { ValidatorContractState } from '../messaging-common/validatorContractState'
import { QueueClient } from '../messaging-dset/queueClient'
import { Consumer, QItem } from '../messaging-dset/queueTypes'
import { BlockError } from './blockError'
import { BlockStorage } from './BlockStorage'
import { IndexStorage } from './IndexStorage'
import { QueueManager } from './queueManager'
// todo reshard():
// raise a flag while executing this; handle new updates somehow?
// todo V2 reshard():
// redownload every block from peers (snodes),
// using the right virtual queue which exists for missing shards in (shardsToAdd)
@Service()
export default class StorageNode implements Consumer<QItem>, StorageContractListener {
  public log: Logger = WinstonUtil.newLog(StorageNode)

  @Inject()
  private valContractState: ValidatorContractState

  @Inject()
  private storageContractState: StorageContractState

  @Inject((type) => QueueManager)
  private queueManager: QueueManager

  @Inject()
  private blockStorage: BlockStorage

  @Inject()
  private indexStorage: IndexStorage

  @Inject()
  private snodeInfoUtil: SNodeInfoUtil

  @Inject()
  private snodePolling: BlockPolling

  @Inject()
  private cronScheduler: CronScheduler

  private client: QueueClient

  public async postConstruct() {
    await this.blockStorage.postConstruct()
    await this.indexStorage.postConstruct()
    await this.valContractState.postConstruct()
    await this.storageContractState.postConstruct(true, this)
    await this.queueManager.postConstruct()
    await this.cronScheduler.postConstruct()
    await this.snodePolling.checkAndInitiatePooling()
  }

  // remote queue handler
  async accept(item: QItem): Promise<boolean> {
    // check hash
    const mb = BitUtil.base16ToBytes(item.object as string)
    Check.notEmpty(item.id.toString(), 'message block has no id')
    const calculatedHash = BlockUtil.hashBlockAsHex(mb)
    if (calculatedHash !== item.object_hash) {
      this.log.error(
        'received item hash=%s , ' +
          'which differs from calculatedHash=%s, ' +
          'ignoring the block because producer calculated the hash incorrectly',
        item.object_hash,
        calculatedHash
      )
      return false
    }
    const parsedBlock = BlockUtil.parseBlock(mb)
    await this.handleBlock(parsedBlock, mb, item.object_hash)
  }

  /**
   * Storage node eats the block. Main method.
   *
   * @param parsedBlock
   * @param rawBlock
   * @param hash
   * @return true, if block is new
   */
  async handleBlock(parsedBlock: Block, rawBlock: Uint8Array, hash?: string): Promise<boolean> {
    // check for validation
    if (!hash) {
      hash = BlockUtil.hashBlockAsHex(rawBlock)
    }
    const validatorSet = new Set(this.valContractState.getAllNodesMap().keys())
    const checkResult = await BlockUtil.checkBlockAsSNode(
      parsedBlock,
      validatorSet,
      this.valContractState.contractCli.valPerBlock
    )
    if (!checkResult.success) {
      throw new BlockError('Block validation failed' + checkResult.err)
    }
    // check database

    const shardSet = BlockUtil.calculateAffectedShards(
      parsedBlock,
      this.storageContractState.shardCount
    )
    const isNew = await this.blockStorage.saveBlockWithShardData(
      parsedBlock,
      hash,
      shardSet,
      BitUtil.bytesToBase16(rawBlock)
    )
    if (!isNew) {
      // this is not an error, because we read duplicates from every validator
      this.log.debug('block %s already exists ', hash)
      return false
    }
    // send block
    await this.indexStorage.unpackBlockToInboxes(parsedBlock, shardSet)
    return true
  }

  public getShardStatus(
    oldShards: Set<number>,
    newShards: Set<number>
  ): {
    shardsToAdd: Set<number>
    shardsToDelete: Set<number>
    commonShards: Set<number>
  } {
    const shardsToAdd = Coll.substractSet(newShards, oldShards)
    const shardsToDelete = Coll.substractSet(oldShards, newShards)
    const commonShards = Coll.intersectSet(oldShards, newShards)
    return { shardsToAdd, shardsToDelete, commonShards }
  }

  public async handleReshard(
    currentNodeShards: Set<number> | null,
    allNodeShards?: Map<string, Set<number>>,
    oldShardsTest?: Set<number>
  ) {
    try {
      this.log.debug('handleReshard()')
      this.log.debug('currentNodeShards: %j', Coll.setToArray(currentNodeShards))
      this.log.debug('allNodeShards: %j', allNodeShards)
      const newShards = currentNodeShards ?? new Set()
      const oldShards = oldShardsTest ?? (await this.blockStorage.loadNodeShards())
      this.log.debug(
        'handleReshard(): newShards: %j oldShards: %j',
        Coll.setToArray(newShards),
        Coll.setToArray(oldShards)
      )
      if (Coll.isEqualSet(newShards, oldShards)) {
        this.log.debug('handleReshard(): no reshard is needed')
        return
      }
      const { shardsToAdd, shardsToDelete, commonShards } = this.getShardStatus(
        oldShards,
        newShards
      )
      this.log.debug(
        'shardsToAdd %j shardsToDelete %j shardsRemaining %j',
        Coll.setToArray(shardsToAdd),
        Coll.setToArray(shardsToDelete),
        Coll.setToArray(commonShards)
      )
      if (shardsToDelete.size != 0) {
        const expiryTime = new Date(Math.floor(Date.now()) + DateUtil.ONE_DAY_IN_MILLISECONDS)
        await this.indexStorage.setExpiryTimeForTransactions(shardsToDelete, expiryTime)
        await this.indexStorage.updateBlockExpiryTimestampPaginated(shardsToDelete, expiryTime)
      }
      if (shardsToAdd.size != 0) {
        this.log.debug('Syncing new shards')
        await this.snodeInfoUtil.init(shardsToAdd)
        const sNodeInfo = this.snodeInfoUtil.mapNodeInfoToShards
        const viewDetailsPromises = Array.from(sNodeInfo).map(async ([nodeInfo, shards]) => {
          if (
            nodeInfo &&
            shards.size > 0 &&
            nodeInfo.nodeId != this.storageContractState.getNodeAddress()
          ) {
            const shardsArray = Coll.setToArray(shards)
            this.log.debug(`Node Info: ${JSON.stringify(nodeInfo)} Shards: ${shardsArray}`)

            try {
              const response = await SNodeInfoUtil.getViewDetails(nodeInfo.url, shardsArray)
              if (!response.error) {
                this.log.debug('Response from node: %j', response)
                const viewInfo: { count; viewId } = response
                if (viewInfo && viewInfo.count && viewInfo.viewId) {
                  await BlockClass.createRecordInStorageSyncTable(
                    viewInfo.viewId,
                    'IN',
                    viewInfo.count,
                    shards,
                    nodeInfo.url
                  )
                }
              } else {
                this.log.error('Error fetching view details from node: %s', nodeInfo.url)
                this.log.error('Error: %s', response.error)
              }
            } catch (e) {
              this.log.error('Error fetching view details from node: %s', nodeInfo.url)
              this.log.error('Error: %s', e)
            }
          }
        })
        await Promise.all(viewDetailsPromises)
        await this.blockStorage.saveNodeShards(newShards)
        void (async () => {
          try {
            await this.snodePolling.initiatePooling()
          } catch (error) {
            this.log.error('Background pooling error: %s', error)
          }
        })()
      }
    } catch (e) {
      this.log.error('Error while handling reshard: %s', e)
    }

    // add to index
    // reprocess every block from blocks table (only once per each block)
    // if the block has shardsToAdd -> add anything which is in shardsToAdd
  }
}
