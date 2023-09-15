import {Service} from "typedi";
import {WinstonUtil} from "../../utilz/winstonUtil";
import {Logger} from "winston";
import {MySqlUtil} from "../../utilz/mySqlUtil";
import {MessageBlock, MessageBlockUtil} from "../messaging-common/messageBlock";
import StrUtil from "../../utilz/strUtil";
import {Coll} from "../../utilz/coll";
import {Check} from "../../utilz/check";
import DbHelper from "../../helpers/dbHelper";

// stores everything in MySQL
@Service()
export class BlockStorage {
  public log: Logger = WinstonUtil.newLog(BlockStorage);

  public async postConstruct() {
    await this.createStorageTablesIfNeeded();
  }

  private async createStorageTablesIfNeeded() {
    await MySqlUtil.insert(`
        CREATE TABLE IF NOT EXISTS blocks
        (
            object_hash   VARCHAR(255) NOT NULL COMMENT 'optional: a uniq field to fight duplicates',
            object        MEDIUMTEXT   NOT NULL,
            object_shards JSON         NOT NULL COMMENT 'message block shards',
            PRIMARY KEY (object_hash)
        ) ENGINE = InnoDB
          DEFAULT CHARSET = utf8;
    `);

    await MySqlUtil.insert(`
        CREATE TABLE IF NOT EXISTS dset_queue_mblock
        (
            id           BIGINT       NOT NULL AUTO_INCREMENT,
            ts           timestamp default CURRENT_TIMESTAMP() COMMENT 'timestamp is used for querying the queu',
            object_hash  VARCHAR(255) NOT NULL,
            object_shard INT          NOT NULL COMMENT 'message block shard',
            PRIMARY KEY (id),
            UNIQUE KEY uniq_mblock_object_hash (object_hash, object_shard),
            FOREIGN KEY (object_hash) REFERENCES blocks (object_hash)
        ) ENGINE = InnoDB
          DEFAULT CHARSET = utf8;
    `);

    await MySqlUtil.insert(`
        CREATE TABLE IF NOT EXISTS dset_client
        (
            id              INT          NOT NULL AUTO_INCREMENT,
            queue_name      varchar(32)  NOT NULL COMMENT 'target node queue name',
            target_node_id  varchar(128) NOT NULL COMMENT 'target node eth address',
            target_node_url varchar(128) NOT NULL COMMENT 'target node url, filled from the contract',
            target_offset   bigint(20)   NOT NULL DEFAULT 0 COMMENT 'initial offset to fetch target queue',
            state           tinyint(1)   NOT NULL DEFAULT 1 COMMENT '1 = enabled, 0 = disabled',
            PRIMARY KEY (id),
            UNIQUE KEY uniq_dset_name_and_target (queue_name, target_node_id)
        ) ENGINE = InnoDB
          DEFAULT CHARSET = utf8;
    `);

    await MySqlUtil.insert(`
        CREATE TABLE IF NOT EXISTS contract_shards
        (
            ts              timestamp default CURRENT_TIMESTAMP() COMMENT 'update timestamp',
            shards_assigned json NOT NULL COMMENT 'optional: a uniq field to fight duplicates',
            PRIMARY KEY (ts)
        ) ENGINE = InnoDB
          DEFAULT CHARSET = utf8;

    `);
  }

  async saveBlockWithShardData(mb: MessageBlock, calculatedHash: string, shardSet: Set<number>): Promise<boolean> {
    // NOTE: the code already atomically updates the db ,
    //  so let's drop select because it's excessive)
    let hashFromDb = await MySqlUtil.queryOneValueOrDefault(
      'SELECT object_hash FROM blocks where object_hash=?',
      null, calculatedHash);
    if (hashFromDb != null) {
      this.log.info('received block with hash %s, ' +
        'already exists in the storage at index %d, ignoring',
        calculatedHash, hashFromDb);
      return false;
    }
    // insert block
    this.log.info('received block with hash %s, adding to the db', calculatedHash);
    const objectAsJson = JSON.stringify(mb);
    const shardSetAsJson = JSON.stringify(Coll.setToArray(shardSet));
    const res = await MySqlUtil.insert(
      `INSERT
           IGNORE
       INTO blocks(object, object_hash, object_shards)
       VALUES (?, ?, ?)`,
      objectAsJson, calculatedHash, shardSetAsJson);
    let requiresProcessing = res.affectedRows === 1;
    if (!requiresProcessing) {
      return false;
    }
    // insert block to shard mapping
    let valuesStr = '';
    let valuesArr = [];
    for (const shardId of shardSet) {
      valuesArr.push(calculatedHash, shardId);
      valuesStr += valuesStr.length == 0 ? '(? , ?)' : ',(? , ?)'
    }
    const res2 = await MySqlUtil.insert(
      `INSERT
           IGNORE
       INTO dset_queue_mblock(object_hash, object_shard)
       VALUES
           ${valuesStr}`,
      ...valuesArr);
    return true;
  }

  /**
   * Reads the latest row (by timestamp)
   * ex: '[0,1,2,...,31]', 2023-05-05 17-00
   * and returns a set of {0,1,2..,31}
   */
  public async loadNodeShards(): Promise<Set<number> | null> {
    const shardsAssigned = await MySqlUtil.queryOneValueOrDefault<string>(
      'select shards_assigned from contract_shards order by ts desc limit 1', null);
    let result: Set<number>;
    if (shardsAssigned != null && !StrUtil.isEmpty(shardsAssigned)) {
      const arr = JSON.parse(shardsAssigned);
      result = new Set(arr);
    } else {
      result = new Set<number>();
    }
    return result;
  }

  /**
   * Writes a set of {0,1,2..,31}
   * to a new row with new timestamp
   * @param nodeShards
   */
  public async saveNodeShards(nodeShards: Set<number>): Promise<void> {
    let arr = Coll.setToArray(nodeShards);
    let arrAsJson = JSON.stringify(arr);
    await MySqlUtil.insert('INSERT IGNORE INTO contract_shards(shards_assigned) VALUES(?)', arrAsJson);
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
  public async iterateAllStoredBlocks(shardCountFromStorageContract: number,
                                      pageSize: number,
                                      shardsToLookFor: Set<number>,
                                      handler: (messageBlockJson: string,
                                                messageBlockHash: string,
                                                messageBlockShards: Set<number>) => Promise<void>) {
    if (shardsToLookFor.size == 0) {
      this.log.debug('iterateAllStoredBlocks(): no shards to unpack ');
      return;
    }
    // [1,2] => (1, 2)
    let shardsAsCsv = Array.from(shardsToLookFor.keys()).join(',');

    // query size
    let queryLimit = pageSize;
    Check.isTrue(queryLimit > 0 && queryLimit < 1000, 'bad query limit');
    let subqueryRowLimit = Math.round(3 * pageSize * shardCountFromStorageContract / 2);
    Check.isTrue(shardCountFromStorageContract > 0 && shardCountFromStorageContract < 1000,
      'bad subquery limit');

    // remember last N object hashes;
    // this is the amount of a page that should be enough to remove duplicate object hashes
    // i.e. 32 shards x 30 rows = approx 1000 rows of history
    let cache = new Set<string>();
    let cacheMaxSize = 2 * subqueryRowLimit;

    let fromId = null;
    let rows = null;
    do {
      /*
      Finds rows
        | minId | object_hash | shardsJson |
        | 3     | 1           | [2,1]      |
     */
      rows = await MySqlUtil.queryArr<{ minId: number, object_hash: string, shardsJson: string }>(
        `SELECT MIN(id) as minId, object_hash, CONCAT('[', GROUP_CONCAT(object_shard), ']') as shardsJson
         FROM (SELECT id, object_hash, object_shard
               FROM dset_queue_mblock
               WHERE object_shard IN (${shardsAsCsv})
                 and (? IS NULL OR id < ?)
               ORDER BY id DESC
               LIMIT ?) as sub
         GROUP BY object_hash
         ORDER BY minId DESC
         LIMIT ?`,
        fromId, fromId, subqueryRowLimit, queryLimit);

      for (const row of rows) {
        const mbHash = row.object_hash;
        if (!cache.has(mbHash)) {
          const row = await MySqlUtil.queryOneRow<{ object: string, object_shards: string }>(
            'select object, object_shards from blocks where object_hash=?', mbHash);
          if (row == null || StrUtil.isEmpty(row.object)) {
            this.log.error('skipping objectHash=%s because there is no matching shard info in blocks table',
              mbHash);
            continue;
          }
          const mbShardSet = Coll.parseAsNumberSet(row.object_shards);
          await handler(row.object, mbHash, mbShardSet);
          cache.add(mbHash);
          if (cache.size > cacheMaxSize) {
            const firstCachedValue = cache.values().next().value;
            cache.delete(firstCachedValue);
          }
        }
        fromId = Math.min(fromId, row.minId);
      }
      Check.isTrue(cache.size <= cacheMaxSize);
    } while (rows != null && rows.length > 0);
  }

}