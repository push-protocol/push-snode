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

    public static async createNewStorageDatabase():Promise<boolean>{
        const date = new Date()
        const dbdate = date.getFullYear().toString() + date.getMonth().toString()
        console.log(dbdate);
        const sql = `
        DROP TABLE IF EXISTS storage_ns_inbox_d_${dbdate};
            CREATE TABLE IF NOT EXISTS storage_ns_inbox_d_${dbdate}
            (
                namespace VARCHAR(20) NOT NULL,
                namespace_shard_id VARCHAR(20) NOT NULL,
                namespace_id VARCHAR(20) NOT NULL,
                ts TIMESTAMP NOT NULL default NOW(),
                rowUuid VARCHAR(64) NOT NULL PRIMARY KEY,
                dataSchema VARCHAR(20) NOT NULL,
                payload JSONB
            );
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
        where namespace='${namespace}' and namespace_shard_id='${namespaceShardId}'`
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
                     and ts_start <= '${dateYmd.toISO()}' and ts_end >= '${dateYmd.toISO()}'`
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
                                 storageTable: string, dateYmd:any, page:number):Promise<string[]> {
        log.debug(`date is ${dateYmd.toISO()}`);
        const pageSize = 10;
        const sql = `select payload as payload
                     from ${storageTable}
                     order by ts desc
                     limit ${pageSize}
                     offset ${page * pageSize}'`
        log.debug(sql);
        return db.query(sql).then(data => {
            log.debug(data);
            if(data.length!=1) {
                return Promise.reject('missing table with the correct name');
            }
            return data[0];
        }).
        catch(err => {
            log.debug(err);
            return Promise.resolve('');
        });
    }
}