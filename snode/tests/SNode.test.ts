import chai from 'chai'
import RandomUtil from '../src/helpers/randomUtil'
import pgPromise, {IDatabase} from 'pg-promise';
import {AxiosResponse} from "axios";
import PromiseUtil from "../src/helpers/promiseUtil";
// import crypto from 'crypto'
const crypto = require("crypto");
var _ = require('lodash');

const expect = chai.expect
import assert from 'assert-ts';
const axios = require('axios');
import {DateTime} from "ts-luxon";
import DateUtil from "../src/helpers/dateUtil";
import DbHelper from "../src/helpers/dbHelper";
import EnvLoader from "../src/config/envLoader";


EnvLoader.loadEnvOrFail();


class SNode1Constants {
    // DATA GENERATION
    static dbUri = `postgres://${EnvLoader.getPropertyOrFail('DB_USER')}:${EnvLoader.getPropertyOrFail('DB_PASS')}@${EnvLoader.getPropertyOrFail('DB_HOST')}:5432/${EnvLoader.getPropertyOrFail('DB_NAME')}`;
    // API TESTS
    static apiUrl = 'http://localhost:3000';
    static namespace = 'feeds';
}

console.log(SNode1Constants.dbUri);

function patchPromiseWithState() {
    Object.defineProperty(Promise.prototype, "state", {
        get: function () {
            const o = {};
            return Promise.race([this, o]).then(
                v => v === o ? "pending" : "resolved",
                () => "rejected");
        }
    });
}

patchPromiseWithState();

async function cleanAllTablesAndInitNetworkStorageLayout(db: IDatabase<any>) {
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
    for (let namespace of namespaceArr) {
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

async function selectWithParam(db: IDatabase<any>, value: string) {
    const result1 = await db.result('SELECT $1 as VALUE', [value]);
    console.log(result1.rows[0].value);
}

async function doPut(baseUri: string, ns: string, nsIndex: string, ts: number, key: string, data: any): Promise<AxiosResponse> {
    let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/ts/${ts}/key/${key}`;
    console.log(`PUT ${url}`, data);
    let resp = await axios.post(url, data, {timeout: 5000});
    console.log(resp.status);
    return resp;
}

async function doGet(baseUri: string, ns: string, nsIndex: string, date: string, key: string): Promise<AxiosResponse> {
    let resp = await axios.get(`${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/date/${date}/key/${key}`, {timeout: 3000});
    console.log(resp.status, resp.data);
    return resp;
}

async function doList(baseUri: string, ns: string, nsIndex: string, month: string, firstTs?: number): Promise<AxiosResponse> {
    let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/month/${month}/list/`;
    if (firstTs != null) {
        url += `?firstTs=${firstTs}`
    }
    let resp = await axios.post(url, {timeout: 3000});
    console.log('LIST', url, resp.status, resp.data);
    return resp;
}

async function performOneTest(baseUri: string, ns: string, testCounter: number): Promise<number> {
    const startTs = Date.now();
    console.log("-->started test", testCounter);
    let key = crypto.randomUUID();
    let dataToDb = {
        name: 'john' + '1',
        surname: crypto.randomBytes(10).toString('base64'),
        id: RandomUtil.getRandomInt(0, 100000)
    };

    let nsIndex = RandomUtil.getRandomInt(0, 100000).toString();

    let dateObj = RandomUtil.getRandomDate(DateTime.fromObject({year: 2022, month: 1, day: 1}),
        DateTime.fromObject({year: 2022, month: 12, day: 31}))
    if (!dateObj.isValid) {
        console.log("INVALID DATE !!! ", dateObj);
        return
    }
    let dateFormatted = dateObj.toFormat('yyyyMMdd');
    console.log('dateFormatted', dateFormatted);

    let putResult = await doPut(baseUri, ns, nsIndex, dateObj.toUnixInteger() + 0.123456, key, dataToDb);
    if (putResult.status != 201) {
        console.log('PUT ERROR!!! ', putResult.status);
        return;
    }
    let getResult = await doGet(baseUri, ns, nsIndex, dateFormatted, key);
    if (getResult.status != 200) {
        console.log('GET ERROR!!! ', getResult.status);
        return;
    }
    let dataFromDb = getResult.data;
    let isEqual = _.isEqual(dataToDb, dataFromDb);
    if (!isEqual) {
        console.log(`isEqual = `, isEqual);
        console.log('dataToDb', dataToDb, 'dataFromDb', dataFromDb);
    }
    console.log("-->finished test", testCounter, " elapsed ", (Date.now() - startTs) / 1000.0);
    expect(isEqual).equals(true);
    return Promise.resolve(getResult.status);
}

describe('snode-full', function () {

    const pg = pgPromise({});
    const snodeDb = pg(SNode1Constants.dbUri);

    it('snode-init', async function () {
        this.timeout(30000);
        await cleanAllTablesAndInitNetworkStorageLayout(snodeDb);
    })

    it('snode-put-get', async function () {
        this.timeout(30000);

        let promiseArr = [];
        console.log('PARALLEL_THREADS=', process.env.PARALLEL_THREADS);
        let parallelThreads = process.env.PARALLEL_THREADS || 50;
        for (let i = 0; i < parallelThreads; i++) {
            try {
                promiseArr.push(performOneTest(SNode1Constants.apiUrl, SNode1Constants.namespace, i)); // TODO !!!!!!!!!
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

    it('snode-test-list', async function () {
        const seedDate = DateUtil.buildDateTime(2015, 1, 22);
        const nsIndex = '1000';

        // Generate data within the same month, only days are random
        const numOfRowsToGenerate = 37;
        for (let i = 0; i < numOfRowsToGenerate; i++) {
            const key = crypto.randomUUID();
            const dataToDb = {
                name: 'john' + '1',
                surname: crypto.randomBytes(10).toString('base64'),
                id: RandomUtil.getRandomInt(0, 100000)
            };
            let randomDayWithinSameMonth = RandomUtil.getRandomDateSameMonth(seedDate);
            const ts = DateUtil.dateTimeToUnixFloat(randomDayWithinSameMonth);
            let putResult = await doPut(SNode1Constants.apiUrl, SNode1Constants.namespace, nsIndex,
                ts, key, dataToDb);

        }

        // Query Generated rows and count them
        let month = DateUtil.formatYYYYMM(seedDate);
        let resp;
        let itemsLength;
        let query = 0;
        let firstTs;
        let totalRowsFetched = 0;
        do {
            resp = await doList(SNode1Constants.apiUrl, SNode1Constants.namespace, nsIndex, month, firstTs);
            query++;
            itemsLength = resp?.data?.items?.length || 0;
            totalRowsFetched += itemsLength;
            let lastTs = resp?.data?.lastTs;
            console.log('query', query, `got `, itemsLength, 'items, lastTs = ', lastTs);
            firstTs = lastTs
        } while ((resp?.data?.items?.length || 0) > 0)

        console.log('total rows fetched ', totalRowsFetched);

        // Compare rows in DB (storageTable) vs rows fetched via API
        const shardId = DbHelper.calculateShardForNamespaceIndex(SNode1Constants.namespace, nsIndex);
        const storageTable = await DbHelper.findStorageTableByDate(SNode1Constants.namespace, shardId, seedDate);
        const rowCount = await snodeDb.one(`SELECT count(*) as count FROM ${storageTable}`).then(value => Number.parseInt(value.count));
        console.log(`${storageTable} contains ${rowCount} rows`);
        expect(rowCount).equals(totalRowsFetched);
    });
})
