import {Container} from 'typedi';
import config from '../config';
import StrUtil from './strUtil'
import log from '../loaders/logger';
import pgPromise from 'pg-promise';
const { DateTime } = require("luxon");

const pg = pgPromise({});

// todo switch to a config file
export const db = pg("postgres://postgres:postgres@localhost:5432/postgres");
const crypto = require('crypto');

export default class DbHelper {

    // maps key -> 8bit space (0..255)
    // uses first 8bit from an md5 hash
    public static calculateShardForNamespaceIndex(namespace: string, key: string): number {
      let buf = crypto.createHash('md5').update(key).digest();
      let i32 = buf.readUInt32LE(0);
      const i8bits = i32 & 0xFF;
      log.debug('calculateShardForNamespaceIndex(): ',buf, '->' , i32, '->', i8bits);
      return i8bits;
    }

    public static async checkIfStorageTableExists():Promise<boolean>{
        const date = new Date();
        const dbdate = date.getFullYear().toString() + date.getMonth().toString();
        var sql =`
            SELECT EXISTS(
                SELECT FROM pg_tables 
                WHERE schemaname='public' AND 
                tablename='storage_ns_inbox_d_${dbdate}')
        `
        console.log(sql)
        return db.query(sql).then(data => {
            console.log(data)
            return Promise.resolve(true)
        }).
        catch(err => {
            console.log(err);
            return Promise.resolve(false);
        });
    }


    public static async createNewNodestorageRecord(namespace: string, namespaceShardId: number, ts_start:any, ts_end:any, table_name:string):Promise<boolean>{
        const sql =`
        insert into node_storage_layout (namespace, namespace_shard_id, ts_start, ts_end, table_name) values ('${namespace}', '${namespaceShardId}', '${ts_start} 00:00:00.000000', '${ts_end} 00:00:00.000000', '${table_name}') on conflict do nothing;
        `
        return db.query(sql).then(data => {
            console.log(data)
            return Promise.resolve(true)
        }).
        catch(err => {
            console.log(err);
            return Promise.resolve(false);
        });
    }

    public static async createNewStorageTable(nsName:string, dt:string):Promise<boolean>{
        const tableName = `storage_ns_${nsName}_d_${dt}`;
        const indexName = `${tableName}_idx`;
        const sql = `
            CREATE TABLE IF NOT EXISTS ${tableName}
            (
                namespace VARCHAR(20) NOT NULL,
                namespace_shard_id VARCHAR(20) NOT NULL,
                namespace_id VARCHAR(20) NOT NULL,
                ts TIMESTAMP NOT NULL default NOW(),
                rowUuid VARCHAR(64) NOT NULL PRIMARY KEY,
                dataSchema VARCHAR(20) NOT NULL,
                payload JSONB
            );

            DROP INDEX IF EXISTS ${tableName}_idx;
            CREATE INDEX ${tableName}_idx ON storage_ns_${nsName}_d_${dt} USING btree (namespace ASC, namespace_shard_id ASC, namespace_id ASC, ts ASC);
        `
        console.log(sql)
        return db.query(sql).then(data => {
            console.log(data)
            return Promise.resolve(true)
        }).
        catch(err => {
            console.log(err);
            return Promise.resolve(false);
        });
    }

    // todo fix params substitution for the pg library;
    public static async checkThatShardIsOnThisNode(namespace: string, namespaceShardId: number, nodeId: number): Promise<boolean> {
        const sql = `SELECT count(*) FROM network_storage_layout
        where namespace='${namespace}' and namespace_shard_id='${namespaceShardId}' and node_id='${nodeId}'`
        console.log(sql);
        return db.query(sql).then(data => {
            console.log(data)
            let cnt = parseInt(data[0].count);
            console.log(cnt);
            return cnt === 1
        }).
        catch(err => {
            console.log(err);
            return Promise.resolve(false);
        });
    }

    public static async findStorageTableByDate(namespace: string, namespaceShardId: number, dateYmd:any):Promise<string> {
        log.debug(`date is ${dateYmd.toISO()}`);
        const sql = `select table_name from node_storage_layout
                     where namespace='${namespace}' and namespace_shard_id='${namespaceShardId}' 
                     and ts_start <= '${dateYmd.toISO()}' and ts_end > '${dateYmd.toISO()}'`
        log.debug(sql);
        return db.query(sql).then(data => {
            log.debug(data);
            if(data.length!=1) {
                return Promise.reject('missing table with the correct name');
            }
            return data[0].table_name;
        }).
        catch(err => {
            log.debug(err);
            return Promise.resolve('');
        });
    }

    public static async findValueInTable(tableName: string, key: string):Promise<string> {
        log.debug(`tableName is ${tableName} , key is ${key}`);
        const sql = `select payload
                     from ${tableName}
                     where rowuuid = '${key}'`;
        log.debug(sql);
        return db.query(sql).then(data => {
            log.debug(data);
            if(data.length!=1) {
                return Promise.reject('missing table with the correct name');
            }
            log.debug(`data found: ${ JSON.stringify(data[0].payload)}`)
            return data[0].payload;
        }).
        catch(err => {
            log.debug(err);
            return Promise.resolve('');
        });
    }

    static async putValueInTable(namespace: string, namespaceShardId: number,
                                 namespaceId:string,
                                 storageTable: string, key: string, jsonValue: string) {
        log.debug(`putValueInTable() namespace=${namespace}, namespaceShardId=${namespaceShardId}
        ,storageTable=${storageTable}, key=${key}, jsonValue=${jsonValue}`);
        const sql = `INSERT INTO ${storageTable} 
                    (namespace, namespace_shard_id, namespace_id, rowuuid, dataschema, payload)
                    values ('${namespace}',  '${namespaceShardId}', '${namespaceId}', '${key}', 'v1', '${jsonValue}')
                    ON CONFLICT (rowUuid) DO UPDATE SET payload = '${jsonValue}'`
        log.debug(sql);
        return db.none(sql).then(data => {
            log.debug(data);
            return Promise.resolve();
        }).
        catch(err => {
            log.debug(err);
            return Promise.reject(err);
        });
    }

    static async listInbox(namespace: string, namespaceShardId: number,
                           storageTable: string, firstTsExcluded: string): Promise<object> {
        const pageSize = 5;
        const pageLookAhead = 3;
        const pageSizeForSameTimestamp = pageSize * 20;
        const isFirstQuery = StrUtil.isEmpty(firstTsExcluded);
        const sql = `select rowuuid as rowuuid,
                     extract(epoch from ts) as ts,
                     payload as payload
                     from ${storageTable} ${ isFirstQuery ? '' : `where ts > to_timestamp(${firstTsExcluded})` }
                     order by ts
                     limit ${pageSize + pageLookAhead}`;
        log.debug(sql);
        let data1 = await db.any(sql);
        var items = [];
        var lastTs: number = 0;
        for (let i = 0; i < Math.min(data1.length, pageSize); i++) {
            items.push(DbHelper.convertRowToItem(data1[i], namespace));
            lastTs = data1[i].ts;
        }
        log.debug(`added ${items.length} items; lastTs=${lastTs}`)
        // [0...{pagesize-1 (lastTs)}...{data1.length-1 (lastTsRowId)}....]
        // we always request pageSize+3 rows; so if we have these additional rows we can verify that their ts != last row ts,
        // otherwise we should add these additional rows to the output (works only for 2..3 rows)
        // otherwise we should execute and additional page request
        var lastTsRowId = pageSize - 1;
        if (data1.length > pageSize) {
            // add extra rows for ts = lastTs
            for (let i = pageSize; i < data1.length; i++) {
                if (data1[i].ts == lastTs) {
                    lastTsRowId = i;
                } else {
                    break;
                }
            }
            if (lastTsRowId == data1.length - 1) {
                // we have more rows with same timestamp, they won't fit in pageSize+pageLookAhead rows
                // let's peform additional select for ts = lastTs
                const sql2 = `select rowuuid as rowuuid,
                     extract(epoch from ts) as ts,
                     payload as payload
                     from ${storageTable}
                     where ts = to_timestamp(${lastTs})
                     order by ts
                     limit ${pageSizeForSameTimestamp}`;
                log.debug(sql2);
                let data2 = await db.any(sql2);
                for (let row of data2) {
                    items.push(DbHelper.convertRowToItem(row, namespace));
                }
                log.debug(`extra query with ${data2.length} items to fix duplicate timestamps pagination, total size is ${items.length}`);
            } else if (lastTsRowId > pageSize - 1) {
                // we have more rows with same timestamp, they fit in pageSize+pageLookAhead rows
                for (let i = pageSize; i <= lastTsRowId; i++) {
                    items.push(DbHelper.convertRowToItem(data1[i], namespace));
                }
                log.debug(`updated to ${items.length} items to fix duplicate timestamps pagination`)
            }
        }
        return {
            'items': items,
            'lastTs': lastTs
        };
    }

    private static convertRowToItem(rowObj:any, namespace: string):any {
        return {
            fqkey: namespace + ':' + rowObj.rowuuid,
            ts: rowObj.ts,
            payload: rowObj.payload
        };
    }
}