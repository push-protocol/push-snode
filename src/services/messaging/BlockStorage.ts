import { Service } from 'typedi'
import { Logger } from 'winston'

import { Block } from '../../generated/push/block_pb'
import { Check } from '../../utilz/check'
import { Coll } from '../../utilz/coll'
import { PgUtil } from '../../utilz/pgUtil' // Use PgUtil instead of MySqlUtil
import { StrUtil } from '../../utilz/strUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { BlockUtil } from '../messaging-common/BlockUtil'

// stores everything in postgres
@Service()
export class BlockStorage {
  public log: Logger = WinstonUtil.newLog(BlockStorage)

  public async postConstruct() {
    await this.createStorageTablesIfNeeded()
  }

  private async createStorageTablesIfNeeded() {
    await PgUtil.insert(`
        CREATE TABLE IF NOT EXISTS blocks
        (
            object_hash   VARCHAR(255) NOT NULL, -- optional: a uniq field to fight duplicates
            object        TEXT         NOT NULL,
            object_shards JSONB        NOT NULL, -- message block shards
            PRIMARY KEY (object_hash)
        );
    `)

    await PgUtil.insert(`
      CREATE TABLE IF NOT EXISTS dset_queue_mblock
      (
          id           BIGSERIAL   NOT NULL,
          ts           TIMESTAMP   DEFAULT CURRENT_TIMESTAMP, -- timestamp is used for querying the queue
          object_hash  VARCHAR(255) NOT NULL,
          object_shard INT          NOT NULL, -- message block shard
          PRIMARY KEY (id),
          UNIQUE (object_hash, object_shard),
          FOREIGN KEY (object_hash) REFERENCES blocks (object_hash)
      );
  `)

    await PgUtil.insert(`
        CREATE TABLE IF NOT EXISTS dset_client
        (
            id              SERIAL       NOT NULL,
            queue_name      VARCHAR(32)  NOT NULL, -- target node queue name
            target_node_id  VARCHAR(128) NOT NULL, -- target node eth address
            target_node_url VARCHAR(128) NOT NULL, -- target node url, filled from the contract
            target_offset   BIGINT       NOT NULL DEFAULT 0, -- initial offset to fetch target queue
            state           SMALLINT     NOT NULL DEFAULT 1, -- 1 = enabled, 0 = disabled
            PRIMARY KEY (id),
            UNIQUE (queue_name, target_node_id)
        );
    `)

    await PgUtil.insert(`
      CREATE TABLE IF NOT EXISTS contract_shards
      (
          ts              TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- update timestamp
          shards_assigned JSONB NOT NULL, -- optional: a uniq field to fight duplicates
          PRIMARY KEY (ts)
      );
  `)

    await PgUtil.update(`
    CREATE TABLE IF NOT EXISTS storage_node
    (
        namespace VARCHAR(20) NOT NULL,
        namespace_shard_id VARCHAR(64) NOT NULL,
        namespace_id VARCHAR(64) NOT NULL,
        ts TIMESTAMP NOT NULL default NOW(),
        skey VARCHAR(64) NOT NULL,
        dataSchema VARCHAR(20) NOT NULL,
        payload JSONB,
        PRIMARY KEY(namespace,namespace_shard_id,namespace_id,skey)
    );`)

    await PgUtil.update(`CREATE INDEX IF NOT EXISTS 
    storage_node_idx ON storage_node
    USING btree (namespace ASC, namespace_id ASC, ts ASC);`)

    // create push_keys table
    await PgUtil.update(`
      CREATE TABLE IF NOT EXISTS push_keys(
      masterpublickey VARCHAR(64) PRIMARY KEY,
      did VARCHAR(64) UNIQUE NOT NULL,
      derivedkeyindex INT NOT NULL,
      derivedpublickey VARCHAR(64) UNIQUE NOT NULL
    );
      `)
    // create indexes
    await PgUtil.update(`CREATE INDEX IF NOT EXISTS
      push_keys_idx ON push_keys
      USING btree (did ASC, derivedpublickey ASC);`)

    // create push_wallets key
    await PgUtil.update(`
        CREATE TABLE IF NOT EXISTS push_wallets(
        address VARCHAR(64) NOT NULL,
        did VARCHAR(64) UNIQUE NOT NULL,
        derivedkeyindex INT NOT NULL,
        encrypteddervivedprivatekey TEXT UNIQUE NOT NULL,
        signature TEXT UNIQUE NOT NULL,
        PRIMARY KEY(address, did),
        FOREIGN KEY (DID) REFERENCES push_keys(did) ON DELETE CASCADE);`)

    await PgUtil.update(`CREATE INDEX IF NOT EXISTS
        push_wallets_idx ON push_wallets
        USING btree (did ASC, address ASC, derivedkeyindex ASC);`)

    // create table push_session_keys
    await PgUtil.update(`
    CREATE TABLE IF NOT EXISTS push_session_keys (
    did CHAR(64) NOT NULL,
    derivedkeyindex INT NOT NULL,
    sessionkeypath VARCHAR(255) NOT NULL,  -- String to represent the session key path
    sessionpubkey CHAR(64) UNIQUE NOT NULL,
    PRIMARY KEY (did, sessionpubkey),
    FOREIGN KEY (did) REFERENCES push_wallets(did) ON DELETE CASCADE
);
    `)

    await PgUtil.update(`CREATE INDEX IF NOT EXISTS
    push_session_keys_idx ON push_session_keys
    USING btree (did ASC, sessionpubkey ASC, derivedkeyindex ASC);`)
  }

  async saveBlockWithShardData(
    mb: Block,
    calculatedHash: string,
    shardSet: Set<number>
  ): Promise<boolean> {
    // NOTE: the code already atomically updates the db,
    // so let's drop select because it's excessive)
    const hashFromDb = await PgUtil.queryOneValueOrDefault<string>(
      'SELECT object_hash FROM blocks WHERE object_hash = $1',
      null,
      calculatedHash
    )
    if (hashFromDb != null) {
      this.log.info(
        'received block with hash %s, already exists in the storage at index %s, ignoring',
        calculatedHash,
        hashFromDb
      )
      return false
    }
    // insert block
    this.log.info('received block with hash %s, adding to the db', calculatedHash)
    const objectAsJson = JSON.stringify(BlockUtil.blockToJson(mb))
    const shardSetAsJson = JSON.stringify(Coll.setToArray(shardSet))
    const res = await PgUtil.insert(
      `INSERT INTO blocks(object, object_hash, object_shards)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      objectAsJson,
      calculatedHash,
      shardSetAsJson
    )
    const requiresProcessing = res === 1
    if (!requiresProcessing) {
      return false
    }
    // insert block to shard mapping
    let valuesStr = ''
    const valuesArr: any[] = []
    for (const shardId of shardSet) {
      valuesArr.push(calculatedHash, shardId)
      valuesStr += valuesStr.length == 0 ? '($1, $2)' : ',($1, $2)'
    }
    await PgUtil.insert(
      `INSERT INTO dset_queue_mblock(object_hash, object_shard)
       VALUES ${valuesStr}
       ON CONFLICT DO NOTHING`,
      ...valuesArr
    )
    return true
  }

  /**
   * Reads the latest row (by timestamp)
   * ex: '[0,1,2,...,31]', 2023-05-05 17-00
   * and returns a set of {0,1,2..,31}
   */
  public async loadNodeShards(): Promise<Set<number> | null> {
    const shardsAssigned = await PgUtil.queryOneValueOrDefault<string>(
      'SELECT shards_assigned FROM contract_shards ORDER BY ts DESC LIMIT 1',
      null
    )
    let result: Set<number>
    if (
      typeof shardsAssigned == 'string' &&
      shardsAssigned != null &&
      !StrUtil.isEmpty(shardsAssigned)
    ) {
      const arr = JSON.parse(shardsAssigned)
      result = new Set(arr)
    } else {
      result = new Set<number>()
    }
    return result
  }

  /**
   * Writes a set of {0,1,2..,31}
   * to a new row with new timestamp
   * @param nodeShards
   */
  public async saveNodeShards(nodeShards: Set<number>): Promise<void> {
    const arr = Coll.setToArray(nodeShards)
    const arrAsJson = JSON.stringify(arr)
    await PgUtil.insert(
      'INSERT INTO contract_shards(shards_assigned) VALUES($1) ON CONFLICT DO NOTHING',
      arrAsJson
    )
  }

  /**
   * Iterates over all unique objectHash values in dset_queue_mblock_table.
   * object gets filtered by specific shards
   *
   * handler will get all valid blocks which match the condition
   * we also will query block contents from the blocks table
   *
   * @param shardCountFromStorageContract how many shards could be per 1 block
   * @param pageSize how much data to load in 1 cycle
   * @param shardsToLookFor shards filter
   * @param handler callback for processing
   */
  public async iterateAllStoredBlocks(
    shardCountFromStorageContract: number,
    pageSize: number,
    shardsToLookFor: Set<number>,
    handler: (
      messageBlockJson: string,
      messageBlockHash: string,
      messageBlockShards: Set<number>
    ) => Promise<void>
  ) {
    if (shardsToLookFor.size === 0) {
      this.log.debug('iterateAllStoredBlocks(): no shards to unpack')
      return
    }

    // Convert the set of shards to a comma-separated string for SQL
    const shardsAsCsv = Array.from(shardsToLookFor.keys()).join(',')

    // Validate the query size
    const queryLimit = pageSize
    Check.isTrue(queryLimit > 0 && queryLimit < 1000, 'bad query limit')
    const subqueryRowLimit = Math.round((3 * pageSize * shardCountFromStorageContract) / 2)
    Check.isTrue(
      shardCountFromStorageContract > 0 && shardCountFromStorageContract < 1000,
      'bad subquery limit'
    )

    // Set up a cache to track unique object hashes
    const cache = new Set<string>()
    const cacheMaxSize = 2 * subqueryRowLimit

    let fromId = 0
    let rows = null

    do {
      /*
      Finds rows
        | minId | object_hash | shardsJson |
        | 3     | 1           | [2,1]      |
      */
      rows = await PgUtil.queryArr<{ minId: number; object_hash: string; shardsJson: string }>(
        `SELECT MIN(id) as minId, object_hash, 
                CONCAT('[', STRING_AGG(object_shard::text, ','), ']') as shardsJson
         FROM (SELECT id, object_hash, object_shard
               FROM dset_queue_mblock
               WHERE object_shard IN (${shardsAsCsv})
                 AND ($1::bigint IS NULL OR id < $2::bigint)
               ORDER BY id DESC
               LIMIT $3) AS sub
         GROUP BY object_hash
         ORDER BY minId DESC
         LIMIT $4`,
        fromId,
        fromId,
        subqueryRowLimit,
        queryLimit
      )

      for (const row of rows) {
        const mbHash = row.object_hash
        if (!cache.has(mbHash)) {
          const blockRow = await PgUtil.queryOneRow<{ object: string; object_shards: string }>(
            'SELECT object, object_shards FROM blocks WHERE object_hash = $1',
            mbHash
          )

          if (blockRow == null || StrUtil.isEmpty(blockRow.object)) {
            this.log.error(
              'skipping objectHash=%s because there is no matching shard info in blocks table',
              mbHash
            )
            continue
          }

          const mbShardSet = Coll.parseAsNumberSet(blockRow.object_shards)
          await handler(blockRow.object, mbHash, mbShardSet)

          cache.add(mbHash)
          if (cache.size > cacheMaxSize) {
            const firstCachedValue = cache.values().next().value
            cache.delete(firstCachedValue)
          }
        }
        fromId = Math.min(fromId, parseInt(row.minId))
      }

      Check.isTrue(cache.size <= cacheMaxSize)
    } while (rows != null && rows.length > 0)
  }
}
