import {Injectable, Logger} from "@nestjs/common";
import {IDatabase} from "pg-promise";
const {DateTime} = require("luxon");
const pg = require('pg-promise')({});
const crypto = require('crypto');

@Injectable()
export default class DbService {
    // todo how to start dbHelper from nestjs

    private readonly db: IDatabase<any>;

    private readonly log = new Logger(DbService.name);

    constructor() {
        this.db = pg(`postgres://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:5432/${process.env.DB_NAME}`);
    }

    // maps key -> 8bit space (0..255)
    // uses first 8bit from a md5 hash
    public static calculateShardForNamespaceIndex(namespace: string, key: string): number {
        let buf = crypto.createHash('md5').update(key).digest();
        let i32 = buf.readUInt32LE(0);
        const i8bits = i32 & 0xFF;
        console.log('calculateShardForNamespaceIndex(): ', buf, '->', i32, '->', i8bits);
        return i8bits;
    }

    // todo fix params substitution for the pg library;
    public async checkThatShardIsOnThisNode(namespace: string, namespaceShardId: number, nodeId: number): Promise<boolean> {
        const sql = `SELECT count(*) FROM network_storage_layout
        where namespace='${namespace}' and namespace_shard_id='${namespaceShardId}'`
        this.log.log(sql);
        return this.db.query(sql).then(data => {
            this.log.log(data)
            let cnt = parseInt(data[0].count);
            this.log.log(cnt);
            return cnt === 1
        }).catch(err => {
            this.log.log(err);
            return Promise.resolve(false);
        });
    }

    public async getNodeurlByNodeId(nodeId: string): Promise<string> {
        const sql = `SELECT node_url FROM node_address where node_id='${nodeId}'`
        this.log.debug(sql);
        return this.db.query(sql).then(data => {
            this.log.debug(data);
            return data[0].node_url;
        }).catch(err => {
            this.log.debug(err);
            return Promise.resolve('');
        });
    }

    public async checkIfNodeExists(nodeid: string, namespace: string): Promise<boolean> {
        const sql = `SELECT EXISTS ( SELECT count(*) FROM network_storage_layout
        where node_id='${nodeid}' and namespace='${namespace}')`
        this.log.debug(sql);
        return this.db.query(sql).then(data => {
            this.log.debug(data);
            return Promise.resolve(true)
        }).catch(err => {
            this.log.debug(err);
            return Promise.resolve(false);
        });
    }

    public async checkIfNodeUrlExists(nodeid: string): Promise<boolean> {
        const sql = `SELECT EXISTS ( SELECT count(*) FROM node_address where node_id='${nodeid}')`
        this.log.debug(sql);
        return this.db.query(sql).then(data => {
                this.log.debug(data);
                return Promise.resolve(true)
            }
        ).catch(err => {
            this.log.debug(err);
            return Promise.resolve(false);
        });
    }

    public async getNodeUrl(nodeId: string): Promise<any> {
        const sql = `SELECT node_url FROM node_info where node_id=$1`
        this.log.debug(sql);
        return this.db.one(sql, [nodeId], r => r.node_url)
            .then(data => {
                    return data;
                }
            ).catch(err => {
                this.log.debug(err);
                return Promise.resolve('');
            });
    };

    public async findNodesByNamespaceAndShard(ns: string, nsShardId: number): Promise<string[]> {
        const sql = `select node_id from network_storage_layout where namespace='${ns}' and namespace_shard_id='${nsShardId}'`;
        this.log.debug(sql);
        return this.db.query(sql).then(data => {
            let nodeIds = data.map(row => row.node_id);
            return Promise.resolve(nodeIds)
        }).catch(err => {
            this.log.debug(err);
            return Promise.resolve([]);
        })
    }


}