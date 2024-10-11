import { Inject, Service } from 'typedi'
import { Logger } from 'winston'

import DbHelper from '../../helpers/dbHelper'
import { Coll } from '../../utilz/coll'
import DateUtil from '../../utilz/dateUtil'
import { PgUtil } from '../../utilz/pgUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { FPayload, MessageBlock, MessageBlockUtil } from '../messaging-common/messageBlock'
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
  public async unpackBlockToInboxes(mb: MessageBlock, shardSet: Set<number>) {
    // this is the list of shards that we support on this node
    const nodeShards = this.storageContractState.getNodeShards()
    this.log.debug('storage node supports %s shards: %o', nodeShards.size, nodeShards)
    const shardsToProcess = Coll.intersectSet(shardSet, nodeShards)
    this.log.debug('block %s has %d inboxes to unpack', mb.id, shardsToProcess)
    if (shardsToProcess.size == 0) {
      this.log.debug('finished')
      return
    }

    // ex: 1661214142.123456
    let tsString = '' + MessageBlockUtil.getBlockCreationTimeMillis(mb) / 1000.0
    if (tsString == null) {
      tsString = '' + DateUtil.currentTimeSeconds()
    }
    const currentNodeId = this.valContractState.nodeId
    for (let i = 0; i < mb.txobjList.length; i++) {
      const feedItem = mb.txobjList[i]
      const targetWallets: string[] = MessageBlockUtil.calculateRecipients(mb, i)
      for (let i1 = 0; i1 < targetWallets.length; i1++) {
        const targetAddr = targetWallets[i1]
        const targetShard = MessageBlockUtil.calculateAffectedShard(
          targetAddr,
          this.storageContractState.shardCount
        )
        if (!shardsToProcess.has(targetShard)) {
          continue
        }
        await this.putPayloadToInbox(
          feedItem.tx.category,
          targetShard,
          targetAddr,
          tsString,
          currentNodeId,
          feedItem.tx
        )
      }
    }
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
   * @param fpayload payload format
   *
   * todo pass ts as number
   */
  public async putPayloadToInbox(
    nsName: string,
    nsShardId: number,
    nsId: string,
    ts: string,
    nodeId: string,
    fpayload: FPayload
  ) {
    const key = fpayload.salt
    fpayload.recipients = null // null recipients field because we don't need that
    // const date = DateUtil.parseUnixFloatAsDateTime(ts)
    // this.log.debug(`parsed date ${ts} -> ${date}`)
    // let storageTable = await DbHelper.findStorageTableByDate(nsName, nsShardId, date)
    // this.log.debug(`found table ${storageTable}`)
    // if (StrUtil.isEmpty(storageTable)) {
    //   this.log.error('storage table not found')
    //   const monthStart = date.startOf('month').toISODate().toString()
    //   const monthEndExclusive = date.startOf('month').plus({ months: 1 }).toISODate().toString()
    //   this.log.debug('creating new storage table')
    //   const dateYYYYMM = DateUtil.formatYYYYMM(date)
    //   const tableName = `storage_ns_${nsName}_d_${dateYYYYMM}`
    //   const recordCreated = await DbHelper.createNewNodestorageRecord(
    //     nsName,
    //     nsShardId,
    //     monthStart,
    //     monthEndExclusive,
    //     tableName
    //   )
    //   if (recordCreated) {
    //     this.log.debug('record created: ', recordCreated)
    //     // we've added a new record to node_storage_layout => we can safely try to create a table
    //     // otherwise, if many connections attempt to create a table from multiple threads
    //     // it leads to postgres deadlock sometimes
    //     await DbHelper.createNewStorageTable(tableName)
    //     this.log.debug('creating node storage layout mapping')
    //     storageTable = tableName
    //   }
    // }
    const storageValue = await DbHelper.putValueInStorageTable(
      nsName,
      nsShardId,
      nsId,
      ts,
      key,
      JSON.stringify(fpayload)
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
