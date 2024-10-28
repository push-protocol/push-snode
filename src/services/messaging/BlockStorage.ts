import { Service } from 'typedi'
import { Logger } from 'winston'

import { Block } from '../../generated/push/block_pb'
import { Check } from '../../utilz/check'
import { Coll } from '../../utilz/coll'
import { PgUtil } from '../../utilz/pgUtil' // Use PgUtil instead of MySqlUtil
import { StrUtil } from '../../utilz/strUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { BlockUtil } from '../messaging-common/blockUtil'

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
    DROP TABLE IF EXISTS transactions;
CREATE TABLE IF NOT EXISTS transactions
(
    id             serial primary key,
    category_val   VARCHAR(128) NOT NULL,
    ts             TIMESTAMP    NOT NULL,
    sender         VARCHAR(128) NOT NULL,
    shard_id       BIGINT  NOT NULL,
    data_parsed    JSONB,
    data_id        BIGINT,
    data_raw       bytea,
    hash_val       VARCHAR(64)  NOT NULL,
    tx_raw         bytea
);
create index transactions_idx_cat_and_ts on transactions (category_val, ts);
create index sender_idx on transactions (category_val, sender);
ALTER TABLE transactions ADD CONSTRAINT transactions_uniq_hash UNIQUE (hash_val);
comment on column transactions.id is 'transaction id; should be uniq';
comment on column transactions.sender is ' the wallet which sent the transaction ';
comment on column transactions.data_id is ' this can be a FK to another table with transactions which depends on type: INIT_DID, INIT_SESSION_KEY, NOTIFICATION, etc  (for some type of tx this will be applicable, when json is not enough)';
comment on column transactions.shard_id is ' shard id affected by this transaction ; we need this to delete shard data on re-shard';
comment on column transactions.hash_val is ' uniq transaction hash; calculation is set by the protocol logic in the same way for every node';
comment on column transactions.tx_raw is ' bytes of the tx; non-parsed ';
comment on column transactions.data_raw is ' bytes of the data; non-parsed; for future use';
comment on column transactions.data_parsed is ' data stored as indexable json (for some type of tx this will be applicable)';`)

    await PgUtil.update(`
  DROP TABLE IF EXISTS inboxes;
CREATE TABLE IF NOT EXISTS inboxes
(
    wallet         VARCHAR(128) NOT NULL,
    category_val   VARCHAR(128) NOT NULL,
    ts             TIMESTAMP    NOT NULL,
    shard_id       BIGINT  NOT NULL,
    sender_type    SMALLINT     not null,
    transaction_id bigint      not null,
    PRIMARY KEY (wallet, transaction_id)
);
create index inboxes_idx1 on inboxes (wallet, category_val, ts, sender_type);
comment on table inboxes is
'Virtual Inbox table: every user has a virtual inbox; when a transaction (t1) comes, usually it has a sender A and recipients B,C,D;
 so 4 refs to the transaction id should land into this table: A->t1,B->t1,C->t1,D->t1';
comment on column inboxes.wallet is 'wallet which sees a transaction';
comment on column inboxes.transaction_id is 'tx associated with this wallet';
comment on column inboxes.sender_type is ' 1 = sender, 2 = recipient ';
  `)

    // create push_keys table
    await PgUtil.update(`
      CREATE TABLE IF NOT EXISTS push_keys(
      masterpublickey VARCHAR(150) PRIMARY KEY,
      did VARCHAR(64) UNIQUE NOT NULL,
      derivedkeyindex INT8 NOT NULL,
      derivedpublickey VARCHAR(150) UNIQUE NOT NULL
    );
      `)
    // create indexes
    await PgUtil.update(`CREATE INDEX IF NOT EXISTS
      push_keys_idx ON push_keys
      USING btree (did ASC, derivedpublickey ASC);`)

    // create push_wallets key
    await PgUtil.update(`
        CREATE TABLE IF NOT EXISTS push_wallets(
        address VARCHAR(150) NOT NULL,
        did VARCHAR(150) UNIQUE NOT NULL,
        derivedkeyindex INT8 NOT NULL,
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
    // const requiresProcessing = res.length === 1
    // if (!requiresProcessing) {
    //   return false
    // }
    // insert block to shard mapping
    // let valuesStr = ''
    // const valuesArr: any[] = []
    // for (const shardId of shardSet) {
    //   valuesArr.push(calculatedHash, shardId)
    //   valuesStr += valuesStr.length == 0 ? '($1, $2)' : ',($1, $2)'
    // }
    // await PgUtil.insert(
    //   `INSERT INTO dset_queue_mblock(object_hash, object_shard)
    //    VALUES ${valuesStr}
    //    ON CONFLICT DO NOTHING`,
    //   ...valuesArr
    // )
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
