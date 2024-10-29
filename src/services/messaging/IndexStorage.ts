import { Inject, Service } from 'typedi'
import { Logger } from 'winston'

import { Block, Transaction } from '../../generated/push/block_pb'
import DbHelper from '../../helpers/dbHelper'
import { Check } from '../../utilz/check'
import { Coll } from '../../utilz/coll'
import { DateUtil } from '../../utilz/dateUtil'
import { PgUtil } from '../../utilz/pgUtil'
import { StrUtil } from '../../utilz/strUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { BlockUtil } from '../messaging-common/blockUtil'
import { StorageContractState } from '../messaging-common/storageContractState'
import { ValidatorContractState } from '../messaging-common/validatorContractState'

// stores everything in Postgres (!)
@Service()
export class IndexStorage {
  public log: Logger = WinstonUtil.newLog(IndexStorage)

  @Inject()
  private valContractState: ValidatorContractState

  @Inject()
  private storageContractState: StorageContractState

  public async postConstruct() {
    await DbHelper.createStorageTablesIfNeeded()
  }

  /*
   sends the block contents (internal messages from every response)
   to every recipient's inbox

   This is POSTGRES
  */
  public async unpackBlockToInboxes(mb: Block, shardSet: Set<number>) {
    // this is the list of shards that we support on this node
    const nodeShards = this.storageContractState.getNodeShards()
    this.log.debug('storage node supports %s shards: %o', nodeShards.size, StrUtil.fmt(nodeShards))
    const shardsToProcess = Coll.intersectSet(shardSet, nodeShards)
    this.log.debug('block %s has %d inboxes to unpack', mb.getTs(), shardsToProcess)
    // if (shardsToProcess.size == 0) {
    //   this.log.debug('finished')
    //   return
    // }

    // ex: 1661214142.123456
    let tsString = (mb.getTs() / 1000.0).toString()
    if (tsString == null) {
      tsString = '' + DateUtil.currentTimeSeconds()
    }
    const currentNodeId = this.valContractState.nodeId
    for (let i = 0; i < mb.getTxobjList().length; i++) {
      const feedItem = mb.getTxobjList()[i]
      const targetWallets: string[] = IndexStorage.calculateRecipients(mb, i)
      for (let i1 = 0; i1 < targetWallets.length; i1++) {
        const targetAddr = targetWallets[i1]
        const targetShard = BlockUtil.calculateAffectedShard(
          targetAddr,
          this.storageContractState.shardCount
        )
        if (shardsToProcess.size != 0 && !shardsToProcess.has(targetShard)) {
          continue
        }
        // const trx = feedItem.getTx()
        // console.log(trx.toObject())
        await this.putPayloadToInbox(
          feedItem.getTx().getCategory(),
          targetShard,
          targetAddr,
          tsString,
          currentNodeId,
          feedItem.getTx()
        )
      }
    }
  }

  static calculateRecipients(block: Block, requestOffset: number): string[] {
    Check.isTrue(requestOffset >= 0, 'requestOffset not found')
    return [
      ...block.getTxobjList()[requestOffset].getTx().getRecipientsList(),
      block.getTxobjList()[requestOffset].getTx().getSender()
    ]
  }

  /**
   * Puts a single item into
   * This is POSTGRES
   *
   * @param nsName ex: inbox
   * @param nsShardId ex: 0-31
   * @param nsId ex: eip155:0xAAAAA
   * @param ts current time, ex: 1661214142.123456
   * @param nodeId current node id, ex: 0xAAAAAAA
   * @param payload payload format
   *
   * todo pass ts as number
   */
  public async putPayloadToInbox(
    nsName: string,
    nsShardId: number,
    nsId: string,
    ts: string,
    nodeId: string,
    payload: Transaction
  ) {
    const storageValue = await DbHelper.putValueInStorageTable(
      nsName,
      nsShardId,
      nsId,
      ts,
      payload.getSalt_asB64(),
      payload
    )
    this.log.debug(`found value: ${storageValue}`)
  }

  // todo remove shard entries from node_storage_layout also?
  public async deleteShardsFromInboxes(shardsToDelete: Set<number>) {
    this.log.debug('deleteShardsFromInboxes(): shardsToDelete: %j', Coll.setToArray(shardsToDelete))
    if (shardsToDelete.size == 0) {
      return
    }
    // delete from index
    const idsToDelete = Coll.numberSetToSqlQuoted(shardsToDelete)
    const rows = await PgUtil.queryArr<{ table_name: string }>(
      `select distinct table_name
       from node_storage_layout
       where namespace_shard_id in ${idsToDelete}`
    )
    for (const row of rows) {
      this.log.debug('clearing table %s from shards %o', row, idsToDelete)
      await PgUtil.update(
        `delete
                           from ${row.table_name}
                           where namespace_shard_id in ${idsToDelete}`,
        idsToDelete
      )
    }
  }
}
