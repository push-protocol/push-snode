import chai from 'chai'
import {AxiosResponse} from "axios";
// import crypto from 'crypto'
const crypto = require("crypto");
var _ = require('lodash');

const expect = chai.expect
import assert from 'assert-ts';

const axios = require('axios');
import { RandomUtil, PromiseUtil, EnvLoader, DateUtil, VNodeClient } from 'dstorage-common'
import {DateTime} from "ts-luxon";
import DbHelper from "../src/helpers/dbHelper";


EnvLoader.loadEnvOrFail();

class VNode1Constants {
    // API TESTS
    static apiUrl = 'http://localhost:4000';
    static namespace = 'feeds';
}

let vnodeClient = new VNodeClient();

describe('vnode-full', function () {

    it('vnode-put-get', async function () {
        this.timeout(30000);

        let promiseArr = [];
        console.log('PARALLEL_THREADS=', process.env.PARALLEL_THREADS);
        let parallelThreads = process.env.PARALLEL_THREADS || 1;
        for (let i = 0; i < parallelThreads; i++) {
            try {
                promiseArr.push(performOneTest(VNode1Constants.apiUrl, VNode1Constants.namespace, i));
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
    })

    it('vnode-test-list', async function () {
        const numOfRowsToGenerate = 37;
        const seedDate = DateUtil.buildDateTime(2015, 1, 22);
        // this is almost unique inbox, so it's empty
        const nsIndex = '' + RandomUtil.getRandomInt(1000, 10000000000000000);
        // Generate data within the same month, only days are random
        let storedKeysSet = new Set<String>();
        for (let i = 0; i < numOfRowsToGenerate; i++) {
            const key = crypto.randomUUID();
            storedKeysSet.add(key);
            const dataToDb = {
                name: 'john' + '1',
                surname: crypto.randomBytes(10).toString('base64'),
                id: RandomUtil.getRandomInt(0, 100000)
            };
            let randomDayWithinSameMonth = RandomUtil.getRandomDateSameMonth(seedDate);
            const ts = DateUtil.dateTimeToUnixFloat(randomDayWithinSameMonth);
            let putResult = await vnodeClient.postRecord(VNode1Constants.apiUrl, VNode1Constants.namespace, nsIndex,
                ts + '', key, dataToDb);

        }

        // Query Generated rows and count them
        let month = DateUtil.formatYYYYMM(seedDate);
        let resp: AxiosResponse;
        let itemsLength;
        let query = 0;
        let firstTs;
        let totalRowsFetched = 0;
        do {
            resp = await vnodeClient.listRecordsByMonth(VNode1Constants.apiUrl, VNode1Constants.namespace, nsIndex, month, firstTs);
            query++;
            itemsLength = resp?.data?.items?.length || 0;
            totalRowsFetched += itemsLength;
            let lastTs = resp?.data?.result?.lastTs;
            console.log('query', query, `got `, itemsLength, 'items, lastTs = ', lastTs);
            firstTs = lastTs
            for (let item of resp?.data?.items || []) {
                let success = storedKeysSet.delete(item.skey);
                console.log(`correct key ${item.skey} , success=${success}`);
            }
            // await PromiseUtil.sleep(10000);
        } while ((resp?.data?.items?.length || 0) > 0)

        console.log('total rows fetched ', totalRowsFetched);

        // Compare rows stored vs rows fetched back via API
        expect(storedKeysSet.size).equals(0);


    });

});

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

    let putResult = await vnodeClient.postRecord(baseUri, ns, nsIndex, dateObj.toUnixInteger() + '', key, dataToDb);
    if (putResult.status != 201) {
        console.log('PUT ERROR!!! ', putResult.status);
        return;
    }
    let getResult = await vnodeClient.getRecord(baseUri, ns, nsIndex, dateFormatted, key);
    if (getResult.status != 200) {
        console.log('GET ERROR!!! ', getResult.status);
        return;
    }
    let dataFromDb = getResult.data.items[0].payload;
    let isEqual = _.isEqual(dataToDb, dataFromDb);
    if (!isEqual) {
        console.log(`isEqual = `, isEqual);
        console.log('dataToDb', dataToDb, 'dataFromDb', dataFromDb);
    }
    expect(getResult.data.result.quorumResult).equals('QUORUM_OK');
    console.log("-->finished test", testCounter, " elapsed ", (Date.now() - startTs) / 1000.0);
    expect(isEqual).equals(true);
    return Promise.resolve(getResult.status);
}
