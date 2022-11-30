import chai from 'chai'
// import crypto from 'crypto'
const crypto = require("crypto");
var _ = require('lodash');
import RandomUtil from '../src/helpers/randomUtil'

const expect = chai.expect


import pgPromise, {IDatabase} from 'pg-promise';
import {isDeepStrictEqual} from "util";
const { DateTime } = require("luxon");
const axios = require('axios');


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

async function doPut(baseUri:string, ns:string, nsIndex:string, date:string, key:string, data:any) {
    let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/date/${date}/key/${key}`;
    console.log(`PUT ${url}`, data);
    let resp = await axios.post(url, data);
    console.log(resp.status);
}

async function doGet(baseUri:string, ns:string, nsIndex:string, date:string, key:string) {
    let resp = await axios.get(`${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/date/${date}/key/${key}`);
    console.log(resp.status, resp.data);
    return resp.data;
}

describe('test-snode-full', function () {

    const pg = pgPromise({});
    const snode1Db = pg("postgres://postgres:postgres@localhost:5432/postgres");

    it('init-snode', async function () {
        await cleanAllTablesAndInitNetworkStorageLayout(snode1Db);
    })

    it('test-snode', async function () {

        let testCounter = 0;
        async function performOneTest() {
            console.log("-->test", testCounter++);
            let key = crypto.randomUUID();
            let dataToDb = {
                name: 'john' + '1',
                surname: crypto.randomBytes(10).toString('base64'),
                id: RandomUtil.getRandomInt(0, 100000)
            };

            let ns = 'feeds';
            let nsIndex = RandomUtil.getRandomInt(0, 100000).toString();
            let yearValue = RandomUtil.getRandomInt(2020, 2023);
            let monthValue = RandomUtil.getRandomInt(1, 13);
            let dayValue = RandomUtil.getRandomInt(1, 28);
            let dateObj = DateTime.fromObject({ year: yearValue, month: monthValue, day: dayValue});
            if(!dateObj.isValid) {
                console.log("INVALID DATE !!! ", yearValue, monthValue, dayValue);
                return
            }
            let dateFormatted = dateObj.toFormat('yyyyMMdd');
            console.log('dateFormatted', dateFormatted);
            await doPut('http://localhost:4000', ns, nsIndex, dateFormatted, key, dataToDb);
            let dataFromDb = await doGet('http://localhost:4000', ns, nsIndex, dateFormatted, key);
            let isEqual = _.isEqual(dataToDb, dataFromDb);
            if (!isEqual) {
                console.log(`isEqual = `, isEqual);
                console.log('dataToDb', dataToDb, 'dataFromDb', dataFromDb);
            }
            expect(isEqual).equals(true);
        }

        let promiseArr = [];
        for(let i=0;i<20;i++) {
             promiseArr.push(performOneTest()); // TODO !!!!!!!!!
            // TODO node_storage_layout
            //  ts_start 2022-11-01 00:00:00.000000,
            //  ts_end 2022-11-30 23:59:59.000000
        }
        await Promise.all(promiseArr);
    })
})
