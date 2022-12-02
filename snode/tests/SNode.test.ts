import chai from 'chai'
// import crypto from 'crypto'
const crypto = require("crypto");
var _ = require('lodash');
import RandomUtil from '../src/helpers/randomUtil'

const expect = chai.expect


import pgPromise, {IDatabase} from 'pg-promise';
import {isDeepStrictEqual} from "util";
import {AxiosResponse} from "axios";
import PromiseUtil from "../src/helpers/promiseUtil";
const { DateTime } = require("luxon");
const axios = require('axios');

function patchPromiseWithState() {
    Object.defineProperty(Promise.prototype, "state", {
        get: function(){
            const o = {};
            return Promise.race([this, o]).then(
                v => v === o ? "pending" : "resolved",
                () => "rejected");
        }
    });
}

patchPromiseWithState();

async function cleanAllTablesAndInitNetworkStorageLayout(db:IDatabase<any>) {
    await db.result('TRUNCATE TABLE network_storage_layout');
    console.log("cleaning up table: network_storage_layout");

    await db.result('TRUNCATE TABLE node_storage_layout');
    console.log("cleaning up table: node_storage_layout");

    const resultT2 = await db.result(`select string_agg(table_name, ',') as sql
from information_schema.tables where table_name like 'storage_%';`);
    console.log(resultT2);
    if (resultT2.rowCount > 0 && resultT2.rows[0].sql != null) {
        let truncateStorageTablesSql = resultT2.rows[0].sql;
        console.log("cleaning up storage tables with query: ", truncateStorageTablesSql);
        const resultT3 = await db.result('TRUNCATE TABLE ' + truncateStorageTablesSql);
        console.log("cleaning up tables: ", resultT3.duration, "ms");
        const resultT4 = await db.result('DROP TABLE ' + truncateStorageTablesSql);
        console.log("dropping tables: ", resultT4.duration, "ms");
    }

    const maxNodeId = 3;
    const maxShardId = 255;
    const namespaceArr = ['feeds'];
    let sql = `INSERT INTO network_storage_layout 
                  (namespace, namespace_shard_id, node_id) 
                  VALUES `;
    let first = true;
    for(let namespace of namespaceArr) {
        for (let shardId = 0; shardId <= maxShardId; shardId++) {
            for (let nodeId = 0; nodeId <= maxNodeId; nodeId++) {
                sql += (first ? '' : ',') + `('${namespace}', '${shardId}', '${nodeId}')`;
                first = false;
            }
        }
    }
    console.log(sql);
    const result2 = await db.result(sql);
    console.log("insert new data, affected rows ", result2.rowCount);
}

async function selectWithParam(db:IDatabase<any>, value:string) {
    const result1 = await db.result('SELECT $1 as VALUE', [value]);
    console.log(result1.rows[0].value);
}

async function doPut(baseUri:string, ns:string, nsIndex:string, date:string, key:string, data:any):Promise<AxiosResponse> {
    let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/date/${date}/key/${key}`;
    console.log(`PUT ${url}`, data);
    let resp = await axios.post(url, data, { timeout : 5000 });
    console.log(resp.status);
    return resp;
}

async function doGet(baseUri:string, ns:string, nsIndex:string, date:string, key:string):Promise<AxiosResponse> {
    let resp = await axios.get(`${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/date/${date}/key/${key}`, { timeout : 3000 });
    console.log(resp.status, resp.data);
    return resp;
}

async function performOneTest(testCounter: number):Promise<number> {
    const startTs = Date.now();
    console.log("-->started test", testCounter);
    let key = crypto.randomUUID();
    let dataToDb = {
        name: 'john' + '1',
        surname: crypto.randomBytes(10).toString('base64'),
        id: RandomUtil.getRandomInt(0, 100000)
    };

    let ns = 'feeds';
    let nsIndex = RandomUtil.getRandomInt(0, 100000).toString();
    let yearValue = 2022;
    let monthValue = RandomUtil.getRandomInt(1, 13);
    let dayValue = RandomUtil.getRandomInt(1, 28);
    let dateObj = DateTime.fromObject({ year: yearValue, month: monthValue, day: dayValue});
    if(!dateObj.isValid) {
        console.log("INVALID DATE !!! ", yearValue, monthValue, dayValue);
        return
    }
    let dateFormatted = dateObj.toFormat('yyyyMMdd');
    console.log('dateFormatted', dateFormatted);
    let putResult = await doPut('http://localhost:4000', ns, nsIndex, dateFormatted, key, dataToDb);
    if(putResult.status!=201) {
        console.log('PUT ERROR!!! ', putResult.status);
        return;
    }
    let getResult = await doGet('http://localhost:4000', ns, nsIndex, dateFormatted, key);
    if(getResult.status!=200) {
        console.log('GET ERROR!!! ', getResult.status);
        return;
    }
    let dataFromDb = getResult.data;
    let isEqual = _.isEqual(dataToDb, dataFromDb);
    if (!isEqual) {
        console.log(`isEqual = `, isEqual);
        console.log('dataToDb', dataToDb, 'dataFromDb', dataFromDb);
    }
    console.log("-->finished test", testCounter, " elapsed ", (Date.now() - startTs)/1000.0);
    expect(isEqual).equals(true);
    return Promise.resolve(getResult.status);
}

describe('test-snode-full', function () {

    const pg = pgPromise({});
    const snode1Db = pg("postgres://postgres:postgres@localhost:5432/postgres");

    it('init-snode', async function () {
        this.timeout(30000);
        await cleanAllTablesAndInitNetworkStorageLayout(snode1Db);
    })

    it('test-snode', async function () {
        this.timeout(30000);

        let promiseArr = [];
        let parallelThreads = 50;
        for(let i=0; i<parallelThreads; i++) {
            try {
                promiseArr.push(performOneTest(i)); // TODO !!!!!!!!!
            } catch (e) {
                console.log("failed to submit thread#", i);
            }

        }
        let result = await PromiseUtil.allSettled(promiseArr);
        console.log(result);
        for (const p of promiseArr) {
            try {
                await p;
            } catch (e) {
                console.log('failed to await promise', e)
            }
            console.log(p.state);
        }
    });
})
