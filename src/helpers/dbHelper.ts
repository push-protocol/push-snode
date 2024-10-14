// mysql
import crypto from 'crypto'
import pgPromise from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'
import { DateTime } from 'ts-luxon'

import { InitDid } from '../generated/push/v1/block_pb'
import log from '../loaders/logger'
import { PushKeys } from '../services/transactions/pushKeys'
import { PushWallets } from '../services/transactions/pushWallets'
import { EnvLoader } from '../utilz/envLoader'
import { PgUtil } from '../utilz/pgUtil'
import StrUtil from '../utilz/strUtil'
import { arrayToMap } from '../utilz/typeConversionUtil'
import { WinstonUtil } from '../utilz/winstonUtil'

// postgres
// todo fix variable substitution, see #putValueInTable()
// todo move everything into PgUtil including connection management
// todo use PgUtil
// todo use placeholders (?)

const logger = WinstonUtil.newLog('pg')
const options = {
  query: function (e) {
    logger.debug('', e.query)
    if (e.params) {
      logger.debug('PARAMS: ', e.params)
    }
  }
}
logger.info(`PG_USER is ${EnvLoader.getPropertyOrFail('PG_USER')}`)
const pg: pgPromise.IMain<{}, IClient> = pgPromise(options)
export const pgPool = pg(
  `postgres://${EnvLoader.getPropertyOrFail('PG_USER')}:${EnvLoader.getPropertyOrFail('PG_PASS')}@${EnvLoader.getPropertyOrFail('PG_HOST')}:5432/${EnvLoader.getPropertyOrFail('PG_NAME')}`
)

PgUtil.init(pgPool)

export default class DbHelper {
  public static async createStorageTablesIfNeeded() {
    await PgUtil.update(`
        CREATE TABLE IF NOT EXISTS node_storage_layout
        (
            namespace          VARCHAR(20) NOT NULL,
            namespace_shard_id VARCHAR(64) NOT NULL,
            ts_start           TIMESTAMP   NOT NULL default NOW(),
            ts_end             TIMESTAMP   NOT NULL default NOW(),
            table_name         VARCHAR(64) NOT NULL,
            PRIMARY KEY (namespace, namespace_shard_id, ts_start, ts_end)
        );
    `)
    await PgUtil.update(` 

-- allows itself to be called on every call
-- recreates a view, no more than once per day, which contains
-- a consistent ordered list of all namespaces (wallets) in the system
CREATE OR REPLACE FUNCTION update_storage_all_namespace_view()
RETURNS VOID AS $$
DECLARE
    table_rec RECORD;
    combined_query TEXT := '';
    last_update_var DATE;
BEGIN
    CREATE TABLE IF NOT EXISTS view_update_log (
    view_name TEXT PRIMARY KEY,
    last_update DATE NOT NULL
    );

    INSERT INTO view_update_log (view_name, last_update)
    VALUES ('storage_all_namespace_view', '2000-01-01')
    ON CONFLICT (view_name) DO NOTHING;

    -- Retrieve the last update date from the log
    SELECT last_update INTO last_update_var
    FROM view_update_log
    WHERE view_name = 'storage_all_namespace_view';

    -- Check if the view has already been updated today
    IF last_update_var = CURRENT_DATE THEN
        RETURN;
    END IF;

    -- Construct the combined query
    FOR table_rec IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'storage_ns_%_d_%'
    LOOP
        IF combined_query <> '' THEN
            combined_query := combined_query || ' UNION ';
        END IF;
        combined_query := combined_query || 'SELECT namespace_id, max(ts) as last_ts FROM ' || table_rec.tablename || ' group by namespace_id';
    END LOOP;

    -- Create or replace the view
    EXECUTE 'CREATE OR REPLACE VIEW storage_all_namespace_view AS
             SELECT namespace_id, max(last_ts) as last_usage
             FROM (' || combined_query || ') AS combined_query
             GROUP BY namespace_id
             ORDER BY last_usage desc';

    -- Update the last update date in the log
    UPDATE view_update_log
    SET last_update = CURRENT_DATE
    WHERE view_name = 'storage_all_namespace_view';

END $$ LANGUAGE plpgsql;        
        `)
  }

  // maps key -> 8bit space (0..255)
  // uses first 4bit from an md5 hash
  public static calculateShardForNamespaceIndex(namespace: string, key: string): number {
    const buf = crypto.createHash('md5').update(key).digest()
    const i32 = buf.readUInt32LE(0)
    const i8bits = i32 % 32 // todo it's 0x20 now, not 0xff
    log.debug('calculateShardForNamespaceIndex(): ', buf, '->', i32, '->', i8bits)
    return i8bits
  }

  public static async checkIfStorageTableExists(): Promise<boolean> {
    const date = new Date()
    const dbdate = date.getFullYear().toString() + date.getMonth().toString()
    const sql = `
            SELECT EXISTS(
                SELECT FROM pg_tables 
                WHERE schemaname='public' AND 
                tablename='storage_ns_inbox_d_${dbdate}')
        `
    console.log(sql)
    return pgPool
      .query(sql)
      .then((data) => {
        console.log(data)
        return Promise.resolve(true)
      })
      .catch((err) => {
        console.log(err)
        return Promise.resolve(false)
      })
  }

  public static async createNewNodestorageRecord(
    namespace: string,
    namespaceShardId: number,
    ts_start: any,
    ts_end: any,
    table_name: string
  ): Promise<boolean> {
    const sql = `
        insert into node_storage_layout (namespace, namespace_shard_id, ts_start, ts_end, table_name) 
        values ($1, $2, $3, $4, $5) on conflict do nothing;
        `
    // console.log(sql)
    return pgPool
      .result(sql, [namespace, namespaceShardId, ts_start, ts_end, table_name], (r) => r.rowCount)
      .then((rowCount) => {
        console.log('inserted rowcount: ', rowCount)
        return Promise.resolve(rowCount == 1)
      })
      .catch((err) => {
        console.log(err)
        return Promise.resolve(false)
      })
  }

  public static async createNewStorageTable(tableName: string): Promise<void> {
    // primary key should prevent duplicates by skey per inbox
    await PgUtil.update(`
            CREATE TABLE IF NOT EXISTS ${tableName}
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
            ${tableName}_idx ON ${tableName} 
            USING btree (namespace ASC, namespace_id ASC, ts ASC);`)
  }

  // todo fix params substitution for the pg library;
  public static async checkThatShardIsOnThisNode(
    namespace: string,
    namespaceShardId: number,
    nodeId: string
  ): Promise<boolean> {
    const sql = `SELECT count(*) FROM network_storage_layout
        where namespace='${namespace}' and namespace_shard_id='${namespaceShardId}' and node_id='${nodeId}'`
    console.log(sql)
    return pgPool
      .query(sql)
      .then((data) => {
        console.log(data)
        const cnt = parseInt(data[0].count)
        console.log(cnt)
        return cnt === 1
      })
      .catch((err) => {
        console.log(err)
        return Promise.resolve(false)
      })
  }

  public static async findStorageTableByDate(
    namespace: string,
    namespaceShardId: number,
    dateYmd: DateTime
  ): Promise<string> {
    log.debug(`date is ${dateYmd.toISO()}`)
    const sql = `select table_name from node_storage_layout
                     where namespace='${namespace}' and namespace_shard_id='${namespaceShardId}' 
                     and ts_start <= '${dateYmd.toISO()}' and ts_end > '${dateYmd.toISO()}'`
    log.debug(sql)
    return pgPool
      .query(sql)
      .then((data) => {
        log.debug(data)
        if (data.length != 1) {
          return Promise.reject('missing table with the correct name')
        }
        return data[0].table_name
      })
      .catch((err) => {
        log.debug(err)
        return Promise.resolve('')
      })
  }

  public static async findValueInTable(tableName: string, skey: string): Promise<string> {
    log.debug(`tableName is ${tableName} , skey is ${skey}`)
    const sql = `select payload
                     from ${tableName}
                     where skey = '${skey}'`
    log.debug(sql)
    return pgPool
      .query(sql)
      .then((data) => {
        log.debug(data)
        if (data.length != 1) {
          return Promise.reject('missing table with the correct name')
        }
        log.debug(`data found: ${JSON.stringify(data[0].payload)}`)
        return data[0].payload
      })
      .catch((err) => {
        log.debug(err)
        return Promise.resolve('')
      })
  }

  public static async findValueInStorageTable(
    skey: string,
    namespace: string,
    namespace_id: string
  ): Promise<string> {
    log.debug(`tableName is storage_node , skey is ${skey}`)
    const sql = `select payload
                     from storage_node
                     where skey = '${skey}' and namespace='${namespace}' and namespace_id='${namespace_id}'`
    log.debug(sql)
    return pgPool
      .query(sql)
      .then((data) => {
        log.debug(data)
        if (data.length != 1) {
          return Promise.reject('missing table with the correct name')
        }
        log.debug(`data found: ${JSON.stringify(data[0].payload)}`)
        return data[0].payload
      })
      .catch((err) => {
        log.debug(err)
        return Promise.resolve('')
      })
  }

  public static async findStorageItem(
    ns: string,
    nsIndex: string,
    tableName: string,
    skey: string
  ): Promise<StorageRecord[]> {
    log.debug(`tableName is ${tableName} , skey is ${skey}`)
    const sql = `select skey as skey,
                     extract(epoch from ts) as ts,
                     payload as payload
                     from ${tableName}
                     where skey = '${skey}' and namespace_id='${nsIndex}' and namespace='${ns}'`
    log.debug(sql)
    return pgPool
      .query(sql)
      .then((data) => {
        log.debug(data)
        if (data.length != 1) {
          return Promise.reject('missing table with the correct name')
        }
        const row1 = data[0]
        log.debug(`data found: ${JSON.stringify(row1.payload)}`)
        const record = new StorageRecord(ns, row1.skey, row1.ts, row1.payload)
        return [record]
      })
      .catch((err) => {
        log.debug(err)
        return Promise.resolve([])
      })
  }

  static async putValueInTableDeprecated(
    ns: string,
    shardId: number,
    nsIndex: string,
    storageTable: string,
    ts: string,
    skey: string,
    body: string
  ) {
    log.debug(`putValueInTable() namespace=${ns}, namespaceShardId=${shardId}
        ,storageTable=${storageTable}, skey=${skey}, jsonValue=${body}`)
    const sql = `INSERT INTO ${storageTable} (namespace, namespace_shard_id, namespace_id, ts, skey, dataschema, payload)
                     values (\${ns}, \${shardId}, \${nsIndex}, to_timestamp(\${ts}), \${skey}, 'v1', \${body})
                     ON CONFLICT (namespace, namespace_shard_id, namespace_id, skey) DO UPDATE SET payload = \${body}`
    const params = {
      ns,
      shardId,
      nsIndex,
      ts,
      skey,
      body
    }
    return pgPool
      .none(sql, params)
      .then((data) => {
        log.debug(data)
        return Promise.resolve()
      })
      .catch((err) => {
        log.debug(err)
        return Promise.reject(err)
      })
  }

  static async putValueInStorageTable(
    ns: string,
    shardId: number,
    nsIndex: string,
    ts: string,
    skey: string,
    body: string
  ) {
    log.debug(`putValueInStorageTable() namespace=${ns}, namespaceShardId=${shardId}
        , skey=${skey}, jsonValue=${body}`)
    const sql = `INSERT INTO storage_node (namespace, namespace_shard_id, namespace_id, ts, skey, dataschema, payload)
                     values (\${ns}, \${shardId}, \${nsIndex}, to_timestamp(\${ts}), \${skey}, 'v1', \${body})
                     ON CONFLICT (namespace, namespace_shard_id, namespace_id, skey) DO UPDATE SET payload = \${body}`
    const params = {
      ns,
      shardId,
      nsIndex,
      ts,
      skey,
      body
    }
    return pgPool
      .none(sql, params)
      .then(async (data) => {
        log.debug(data)
        await DbHelper.indexTransactionCategory(ns, shardId, nsIndex, ts, skey, body)
        return Promise.resolve()
      })
      .catch((err) => {
        log.debug(err)
        return Promise.reject(err)
      })
  }

  static async indexTransactionCategory(
    ns: string,
    shardId: number,
    nsIndex: string,
    ts: string,
    skey: string,
    body: string
  ) {
    const parsedBody = typeof body == 'string' ? JSON.parse(body) : body
    // parent function that calls functions to store and index trxs based on category
    if (ns == 'INIT_DID') {
      const deserializedData = InitDid.deserializeBinary(parsedBody['data']).toObject()
      const masterPubKey = deserializedData['masterpubkey']
      const did = parsedBody['sender']
      const derivedKeyIndex = deserializedData['derivedkeyindex']
      const derivedPublicKey = deserializedData['derivedpubkey']
      const walletToEncodedDerivedKeyMap = arrayToMap(deserializedData['wallettoencderivedkeyMap'])
      await DbHelper.putInitDidTransaction({
        masterPublicKey: masterPubKey,
        did: did,
        derivedKeyIndex: derivedKeyIndex,
        derivedPublicKey: derivedPublicKey,
        walletToEncodedDerivedKeyMap: walletToEncodedDerivedKeyMap
      })
    }
    if (ns == 'INIT_SESSION_KEY') {
    } else {
      logger.error('Unknown category')
    }
  }

  static async putInitDidTransaction({
    masterPublicKey,
    did,
    derivedKeyIndex,
    derivedPublicKey,
    walletToEncodedDerivedKeyMap
  }: {
    masterPublicKey: string
    did: string
    derivedKeyIndex: number
    derivedPublicKey: string
    walletToEncodedDerivedKeyMap: Map<string, string>
  }) {
    // Adding initial PushKeys for the masterPublicKey
    await PushKeys.addPushKeys({
      masterPublicKey,
      did,
      derivedKeyIndex,
      derivedPublicKey
    })

    walletToEncodedDerivedKeyMap.forEach(async (value, wallet) => {
      await PushWallets.addPushWallets({
        address: wallet,
        did: did,
        derivedKeyIndex: derivedKeyIndex.toString(),
        encryptedDervivedPrivateKey: value['encderivedprivkey'],
        signature: value['signature']
      })
    })
  }

  static async listInbox(
    namespace: string,
    namespaceShardId: number,
    nsIndex: string,
    storageTable: string,
    firstTsExcluded: string,
    pageSize: number,
    order?: 'ASC' | 'DESC'
  ): Promise<object> {
    order = order || 'ASC'
    const pageLookAhead = 3
    const pageSizeForSameTimestamp = pageSize * 20
    const isFirstQuery = StrUtil.isEmpty(firstTsExcluded)
    const sql = `select skey as skey,
                     extract(epoch from ts) as ts,
                     payload as payload
                     from ${storageTable} 
                     where namespace='${namespace}'
                           and namespace_id='${nsIndex}' 
                           ${isFirstQuery ? '' : `and ts > to_timestamp(${firstTsExcluded})`}
                     order by ts ${order}
                     limit ${pageSize + pageLookAhead}`
    log.debug(sql)
    const data1 = await pgPool.any(sql)
    const items = new Map<string, any>()
    let lastTs: number = 0
    for (let i = 0; i < Math.min(data1.length, pageSize); i++) {
      const item = DbHelper.convertRowToItem(data1[i], namespace)
      items.set(item.skey, item)
      lastTs = data1[i].ts
    }
    log.debug(`added ${items.size} items; lastTs=${lastTs}`)
    // [0...{pagesize-1 (lastTs)}...{data1.length-1 (lastTsRowId)}....]
    // we always request pageSize+3 rows; so if we have these additional rows we can verify that their ts != last row ts,
    // otherwise we should add these additional rows to the output (works only for 2..3 rows)
    // otherwise we should execute and additional page request
    let lastTsRowId = pageSize - 1
    if (data1.length > pageSize) {
      // add extra rows for ts = lastTs
      for (let i = pageSize; i < data1.length; i++) {
        if (data1[i].ts == lastTs) {
          lastTsRowId = i
        } else {
          break
        }
      }
      if (lastTsRowId == data1.length - 1) {
        // we have more rows with same timestamp, they won't fit in pageSize+pageLookAhead rows
        // let's peform additional select for ts = lastTs
        const sql2 = `select skey as skey,
                     extract(epoch from ts) as ts,
                     payload as payload
                     from ${storageTable}
                     where namespace='${namespace}'
                           and namespace_id='${nsIndex}' 
                           and ts = to_timestamp(${lastTs})
                     order by ts
                     limit ${pageSizeForSameTimestamp}`
        log.debug(sql2)
        const data2 = await pgPool.any(sql2)
        for (const row of data2) {
          const item = DbHelper.convertRowToItem(row, namespace)
          items.set(item.skey, item)
        }
        log.debug(
          `extra query with ${data2.length} items to fix duplicate timestamps pagination, total size is ${items.size}`
        )
      } else if (lastTsRowId > pageSize - 1) {
        // we have more rows with same timestamp, they fit in pageSize+pageLookAhead rows
        for (let i = pageSize; i <= lastTsRowId; i++) {
          const item = DbHelper.convertRowToItem(data1[i], namespace)
          items.set(item.skey, item)
        }
        log.debug(`updated to ${items.size} items to fix duplicate timestamps pagination`)
      }
    }
    const itemsArr = [...items.values()]
    return {
      items: itemsArr,
      lastTs: lastTs
    }
  }

  static async listInboxV2(
    namespace: string,
    namespaceShardId: number,
    nsIndex: string,
    firstTsExcluded: string,
    pageSize: number,
    order?: 'ASC' | 'DESC'
  ): Promise<object> {
    order = order || 'ASC'
    const pageLookAhead = 3
    const pageSizeForSameTimestamp = pageSize * 20
    const isFirstQuery = StrUtil.isEmpty(firstTsExcluded)
    const sql = `select skey as skey,
                     extract(epoch from ts) as ts,
                     payload as payload
                     from storage_node 
                     where namespace='${namespace}'
                           and namespace_id='${nsIndex}' 
                           ${isFirstQuery ? '' : `and ts > to_timestamp(${firstTsExcluded})`}
                     order by ts ${order}
                     limit ${pageSize + pageLookAhead}`
    log.debug(sql)
    const data1 = await pgPool.any(sql)
    const items = new Map<string, any>()
    let lastTs: number = 0
    for (let i = 0; i < Math.min(data1.length, pageSize); i++) {
      const item = DbHelper.convertRowToItem(data1[i], namespace)
      items.set(item.skey, item)
      lastTs = data1[i].ts
    }
    log.debug(`added ${items.size} items; lastTs=${lastTs}`)
    // [0...{pagesize-1 (lastTs)}...{data1.length-1 (lastTsRowId)}....]
    // we always request pageSize+3 rows; so if we have these additional rows we can verify that their ts != last row ts,
    // otherwise we should add these additional rows to the output (works only for 2..3 rows)
    // otherwise we should execute and additional page request
    let lastTsRowId = pageSize - 1
    if (data1.length > pageSize) {
      // add extra rows for ts = lastTs
      for (let i = pageSize; i < data1.length; i++) {
        if (data1[i].ts == lastTs) {
          lastTsRowId = i
        } else {
          break
        }
      }
      if (lastTsRowId == data1.length - 1) {
        // we have more rows with same timestamp, they won't fit in pageSize+pageLookAhead rows
        // let's peform additional select for ts = lastTs
        const sql2 = `select skey as skey,
                     extract(epoch from ts) as ts,
                     payload as payload
                     from storage_node
                     where namespace='${namespace}'
                           and namespace_id='${nsIndex}' 
                           and ts = to_timestamp(${lastTs})
                     order by ts
                     limit ${pageSizeForSameTimestamp}`
        log.debug(sql2)
        const data2 = await pgPool.any(sql2)
        for (const row of data2) {
          const item = DbHelper.convertRowToItem(row, namespace)
          items.set(item.skey, item)
        }
        log.debug(
          `extra query with ${data2.length} items to fix duplicate timestamps pagination, total size is ${items.size}`
        )
      } else if (lastTsRowId > pageSize - 1) {
        // we have more rows with same timestamp, they fit in pageSize+pageLookAhead rows
        for (let i = pageSize; i <= lastTsRowId; i++) {
          const item = DbHelper.convertRowToItem(data1[i], namespace)
          items.set(item.skey, item)
        }
        log.debug(`updated to ${items.size} items to fix duplicate timestamps pagination`)
      }
    }
    const itemsArr = [...items.values()]
    return {
      items: itemsArr,
      lastTs: lastTs
    }
  }

  private static convertRowToItem(rowObj: any, namespace: string) {
    return {
      ns: namespace,
      skey: rowObj.skey,
      ts: rowObj.ts,
      payload: rowObj.payload
    }
  }

  static async listAllNsIndex() {
    const updateViewIfNeeded = `select update_storage_all_namespace_view();`
    log.debug(updateViewIfNeeded)
    await pgPool.any(updateViewIfNeeded)
    const selectAll = `select namespace_id, last_usage from storage_all_namespace_view;`
    log.debug(selectAll)
    return pgPool
      .manyOrNone(selectAll)
      .then((data) => {
        log.debug(data)
        return Promise.resolve(
          data == null
            ? []
            : data.map(function (item) {
                return {
                  nsId: item.namespace_id,
                  last_usage: item.last_usage
                }
              })
        )
      })
      .catch((err) => {
        log.debug(err)
        return Promise.reject(err)
      })
  }

  static async getAccountInfo(wallet: string) {
    const sql = `SELECT pk.masterpublickey, pk.did, pk.derivedkeyindex, pk.derivedpublickey,
       pw.address, pw.encrypteddervivedprivatekey, pw.signature
FROM push_keys pk
JOIN push_wallets pw
  ON pk.did = pw.did
WHERE pk.did = '${wallet}'
  AND pk.derivedkeyindex = pw.derivedkeyindex;`
    log.debug(sql)
    return pgPool
      .query(sql)
      .then((data) => {
        log.debug(data)
        return Promise.resolve(data)
      })
      .catch((err) => {
        log.debug(err)
        return Promise.resolve([])
      })
  }
}

export class StorageRecord {
  ns: string
  skey: string
  ts: string
  payload: any

  constructor(ns: string, skey: string, ts: string, payload: any) {
    this.ns = ns
    this.skey = skey
    this.ts = ts
    this.payload = payload
  }
}
