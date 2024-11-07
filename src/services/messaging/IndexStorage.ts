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
    let hash = BlockUtil.hashTxAsHex(payload.serializeBinary())
    const storageValue = await DbHelper.putValueInStorageTable(
      nsName,
      nsShardId,
      nsId,
      ts,
      hash,
      payload
    )
    this.log.debug(`found value: ${storageValue}`)
  }

  public async setExpiryTime(shardsToDelete: Set<number>, expiryTime: Date): Promise<void> {
    this.log.debug('setExpiryTime(): shardsToDelete: %j', Array.from(shardsToDelete))

    if (shardsToDelete.size === 0) {
      return
    }

    // Convert Set to Array once
    const shardIdsArray = Array.from(shardsToDelete)

    for (const shardId of shardIdsArray) {
      // Get count of data present for this shard_id
      const count: number = await PgUtil.queryOneValue(
        `SELECT count(skey) FROM storage_node WHERE namespace_shard_id = $1`,
        shardId.toString()
      )

      // Define page size and calculate the number of pages
      const pageSize = 1000
      const pageCount = Math.ceil(count / pageSize)

      for (let i = 0; i < pageCount; i++) {
        const offset = i * pageSize

        await PgUtil.update(
          `WITH batch AS (
             SELECT skey
             FROM storage_node
             WHERE namespace_shard_id = $1
             LIMIT $2 OFFSET $3
           )
           UPDATE storage_node
           SET expiration_ts = $4
           WHERE skey IN (SELECT skey FROM batch)`,
          shardId.toString(),
          pageSize,
          offset,
          expiryTime
        )
      }
    }
  }

  // todo remove shard entries from node_storage_layout also?
  public async deleteShardsFromInboxes() {
    const currentTime = new Date()
    this.log.debug('deleteShardsFromInboxes() for time %s', currentTime.toISOString())

    const countQuery = `SELECT count(skey) FROM storage_node WHERE expiration_ts IS NOT NULL AND expiration_ts < $1`
    const count: number = parseInt(await PgUtil.queryOneValue(countQuery, currentTime))
    this.log.debug('deleteShardsFromInboxes(): count: %d', count)

    if (count === 0) {
      this.log.debug('deleteShardsFromInboxes(): nothing to delete')
      return
    }

    const pageSize = 1000
    const pageCount = Math.ceil(count / pageSize)

    for (let i = 0; i <= pageCount; i++) {
      await PgUtil.update(
        `WITH batch AS (
           SELECT skey
           FROM storage_node
           WHERE expiration_ts < $1
           LIMIT $2
         )
         DELETE FROM storage_node
         WHERE skey IN (SELECT skey FROM batch)`,
        currentTime,
        pageSize
      )
    }

    this.log.debug('deleteShardsFromInboxes(): deleted %d rows', count)
  }
}
