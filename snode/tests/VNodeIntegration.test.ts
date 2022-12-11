import chai from 'chai'
import {AxiosResponse} from "axios";
// import crypto from 'crypto'
const crypto = require("crypto");
var _ = require('lodash');

const expect = chai.expect
import assert from 'assert-ts';
const axios = require('axios');
import EnvLoader from "../src/config/envLoader";
import RandomUtil from "../src/helpers/randomUtil";
import {DateTime} from "ts-luxon";
import PromiseUtil from "../src/helpers/promiseUtil";
import VNodeClient from "../src/client/vnodeClient";


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
