
import config from '../config';
import log from '../loaders/logger';

const { DateTime } = require("luxon");

const pg = require('pg-promise')({});

// todo switch to a config file
export const db = pg("postgres://postgres:postgres@localhost:5432/postgres@vnode");
export const snodedb = pg("postgres://postgres:postgres@localhost:5432/postgres");
const crypto = require('crypto');

export default class DbHelper {

    // maps key -> 8bit space (0..255)
    // uses first 8bit from an md5 hash
    public static calculateShardForNamespaceIndex(namespace: string, key: string): number {
      let buf = crypto.createHash('md5').update(key).digest();
      let i32 = buf.readUInt32LE(0);
      const i8bits = i32 & 0xFF;
      console.log('calculateShardForNamespaceIndex(): ',buf, '->' , i32, '->', i8bits);
      return i8bits;
    }

    // todo fix params substitution for the pg library;
    public static async checkThatShardIsOnThisNode(namespace: string, namespaceShardId: number, nodeId: number): Promise<boolean> {
        const sql = `SELECT count(*) FROM network_storage_layout
        where namespace='${namespace}' and namespace_shard_id='${namespaceShardId}'`
        console.log(sql);
        return snodedb.query(sql).then(data => {
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

    public static async checkIfNodeExists(nodeid:string, namespace:string):Promise<boolean>{
        const sql = `SELECT EXISTS ( SELECT count(*) FROM network_storage_layout
        where node_id='${nodeid}' and namespace='${namespace}')`
        console.log(sql);
        return db.query(sql).then(data => {
            console.log(data);
            return Promise.resolve(true)
        }).catch(err => {
            console.log(err);
            return Promise.resolve(false);
        });
    }

    public static async checkIfNodeUrlExists(nodeid:string):Promise<boolean>{
        const sql = `SELECT EXISTS ( SELECT count(*) FROM node_address where node_id='${nodeid}')`
        console.log(sql);
        return db.query(sql).then(data => {
            console.log(data);
            return Promise.resolve(true)
        }
        ).catch(err => {
            console.log(err);
            return Promise.resolve(false);
        });
    }

    public static async getNodeUrl(nodeid:string):Promise<any>{
        const sql = `SELECT node_url FROM node_address where node_id='${nodeid}'`
        console.log(sql);
        return db.query(sql).then(data => {
            return data;
        }
        ).catch(err => {
            console.log(err);
            return Promise.resolve('');
        });
    };

    public static async getAllNodeIds(nsName,nShardid):Promise<string[]>{
        const sql = `select node_id from network_storage_layout where namespace='${nsName}' and namespace_shard_id='${nShardid}'`;
        console.log(sql);
        return db.query(sql).then(data => {
            return Promise.resolve(data)
        }).catch(err => {
            console.log(err);
            return Promise.resolve([]);
        })
    }

    public static async findStorageTableByDate(namespace: string, namespaceShardId: number, dateYmd:any):Promise<string> {
        console.log(`date is ${dateYmd.toISO()}`);
        const sql = `select table_name from node_storage_layout
                     where namespace='${namespace}' and namespace_shard_id='${namespaceShardId}' 
                     and ts_start <= '${dateYmd.toISO()}' and ts_end >= '${dateYmd.toISO()}'`
        console.log(sql);
        return snodedb.query(sql).then(data => {
            console.log(data);
            if(data.length!=1) {
                return Promise.reject('missing table with the correct name');
            }
            return data[0].table_name;
        }).
        catch(err => {
            console.log(err);
            return Promise.resolve('');
        });
    }

    public static async findValueInTable(tableName: string, key: string):Promise<string> {
        console.log(`tableName is ${tableName} , key is ${key}`);
        const sql = `select payload
                     from ${tableName}
                     where rowuuid = '${key}'`;
        console.log(sql);
        return snodedb.query(sql).then(data => {
            console.log(data);
            if(data.length!=1) {
                return Promise.reject('missing table with the correct name');
            }
            console.log(`data found: ${ JSON.stringify(data[0].payload)}`)
            return data[0].payload;
        }).
        catch(err => {
            console.log(err);
            return Promise.resolve('');
        });
    }

    
}