
import config from '../config';
import log from '../loaders/logger';
import pgPromise from 'pg-promise';
const { DateTime } = require("luxon");

const pg = pgPromise();

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
      console.log('calculateShardForNamespaceIndex(): ',buf, '->' , i32, '->', i8bits);
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

    public static async checkIfNodeExists(nodeid:string, namespace:string):Promise<boolean>{
        const sql = `SELECT EXISTS ( SELECT count(*) FROM network_storage_layout
        where node_id='${nodeid}' and namespace='${namespace}')`
        console.log(sql);
        return db.query(sql).then(data => {
            return Promise.resolve(true)
        }).catch(err => {
            console.log(err);
            return Promise.resolve(false);
        });
    }

    public static async checkIfNodeUrlExists(nodeid:string):Promise<boolean>{
        const sql = `SELECT EXISTS ( SELECT count(*) FROM network_nodes where node_id='${nodeid}')`
        console.log(sql);
        return db.query(sql).then(data => {
            return Promise.resolve(true)
        }
        ).catch(err => {
            console.log(err);
            return Promise.resolve(false);
        });
    }

    public static async getNodeUrl(nodeid:string):Promise<string>{
        const sql = `SELECT 1 FROM network_nodes where node_id='${nodeid}'`
        console.log(sql);
        return db.query(sql).then(data => {
            return Promise.resolve(data)
        }
        ).catch(err => {
            console.log(err);
            return Promise.resolve('');
        });
    };

    
}