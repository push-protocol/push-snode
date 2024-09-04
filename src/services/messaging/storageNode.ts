import { Inject, Service } from 'typedi'
import { Logger } from 'winston'

import { Check } from '../../utilz/check'
import { Coll } from '../../utilz/coll'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { MessageBlock, MessageBlockUtil } from '../messaging-common/messageBlock'
import {
  StorageContractListener,
  StorageContractState
} from '../messaging-common/storageContractState'
import { ValidatorContractState } from '../messaging-common/validatorContractState'
import { QueueClient } from '../messaging-dset/queueClient'
import { Consumer, QItem } from '../messaging-dset/queueTypes'
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

  private client: QueueClient

  public async postConstruct() {
    await this.blockStorage.postConstruct()
    await this.indexStorage.postConstruct()
    await this.valContractState.postConstruct()
    await this.storageContractState.postConstruct(true, this)
    await this.queueManager.postConstruct()
  }

  // remote queue handler
  async accept(item: QItem): Promise<boolean> {
    // check hash
    const mb = <MessageBlock>item.object
    Check.notEmpty(mb.id, 'message block has no id')
    const calculatedHash = MessageBlockUtil.calculateHash(mb)
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
    // check contents
    // since this check is not for historical data, but for realtime data,
    // so we do not care about old blocked validators which might occur in the historical queue
    const activeValidators = Coll.arrayToFields(
      this.valContractState.getActiveValidators(),
      'nodeId'
    )
    const check1 = MessageBlockUtil.checkBlock(mb, activeValidators)
    if (!check1.success) {
      this.log.error('item validation failed: ', check1.err)
      return false
    }
    // check database
    const shardSet = MessageBlockUtil.calculateAffectedShards(
      mb,
      this.storageContractState.shardCount
    )
    const isNew = await this.blockStorage.saveBlockWithShardData(mb, calculatedHash, shardSet)
    if (!isNew) {
      // this is not an error, because we read duplicates from every validator
      this.log.debug('block %s already exists ', mb.id)
      return false
    }
    // send block
    await this.indexStorage.unpackBlockToInboxes(mb, shardSet)
  }

  public async handleReshard(
    currentNodeShards: Set<number> | null,
    allNodeShards?: Map<string, Set<number>>
  ) {
    const newShards = currentNodeShards ?? new Set()
    const oldShards = await this.blockStorage.loadNodeShards()
    this.log.debug(
      'handleReshard(): newShards: %j oldShards: %j',
      Coll.setToArray(newShards),
      Coll.setToArray(oldShards)
    )
    if (Coll.isEqualSet(newShards, oldShards)) {
      this.log.debug('handleReshard(): no reshard is needed')
      return
    }
    const shardsToAdd = Coll.substractSet(newShards, oldShards)
    const shardsToDelete = Coll.substractSet(oldShards, newShards)
    const commonShards = Coll.intersectSet(oldShards, newShards)
    this.log.debug(
      'shardsToAdd %j shardsToDelete %j shardsRemaining %j',
      Coll.setToArray(shardsToAdd),
      Coll.setToArray(shardsToDelete),
      Coll.setToArray(commonShards)
    )

    await this.indexStorage.deleteShardsFromInboxes(shardsToDelete)

    // add to index
    // reprocess every block from blocks table (only once per each block)
    // if the block has shardsToAdd -> add anything which is in shardsToAdd
    const pageSize = 30
    await this.blockStorage.iterateAllStoredBlocks(
      this.storageContractState.shardCount,
      pageSize,
      shardsToAdd,
      async (messageBlockJson, messageBlockHash, messageBlockShards) => {
        const mb: MessageBlock = JSON.parse(messageBlockJson)
        const shardsToAddFromBlock = Coll.intersectSet(shardsToAdd, messageBlockShards)
        this.log.debug(
          'reindexing block %s, blockShards %s, shardsToAdd %s,, shardsToAddFromBlock',
          messageBlockHash,
          Coll.setToArray(messageBlockShards),
          Coll.setToArray(shardsToAdd),
          Coll.setToArray(shardsToAddFromBlock)
        )
        await this.indexStorage.unpackBlockToInboxes(mb, shardsToAddFromBlock)
      }
    )
    await this.blockStorage.saveNodeShards(newShards)
  }
}
