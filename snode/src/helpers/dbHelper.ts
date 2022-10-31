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
      console.log(buf, '->' , i32, '->', i8bits);
      return i8bits;
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
}