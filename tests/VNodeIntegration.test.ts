import { AxiosResponse } from 'axios'
import chai from 'chai'
// import crypto from 'crypto'
const crypto = require('crypto')
const _ = require('lodash')

const expect = chai.expect

const axios = require('axios')
import { DateUtil, EnvLoader, PromiseUtil, RandomUtil, VNodeClient } from 'dstorage-common'
import { DateTime } from 'ts-luxon'

EnvLoader.loadEnvOrFail()

class VNode1Constants {
  // API TESTS
  static apiUrl = EnvLoader.getPropertyOrFail('TEST_VNODE1_API_URL')
  static namespace = 'feeds'
}

const vnodeClient = new VNodeClient()

describe('vnode-full', function () {
  it('vnode-put-get', async function () {
    this.timeout(30000)

    const promiseArr = []
    console.log('PARALLEL_THREADS=', process.env.PARALLEL_THREADS)
    const parallelThreads = process.env.PARALLEL_THREADS || 1
    for (let i = 0; i < parallelThreads; i++) {
      try {
        promiseArr.push(performOneTest(VNode1Constants.apiUrl, VNode1Constants.namespace, i))
      } catch (e) {
        console.log('failed to submit thread#', i)
      }
    }
    const result = await PromiseUtil.allSettled(promiseArr)
    console.log(result)
    for (const p of promiseArr) {
      try {
        await p
      } catch (e) {
        console.log('failed to await promise', e)
      }
      console.log(p.state)
    }
  })

  it('vnode-test-list', async function () {
    const numOfRowsToGenerate = 37
    const seedDate = DateUtil.buildDateTime(2015, 1, 22)
    // this is almost unique inbox, so it's empty
    const nsIndex = '' + RandomUtil.getRandomInt(1000, 10000000000000000)
    // Generate data within the same month, only days are random
    const storedKeysSet = new Set<String>()
    for (let i = 0; i < numOfRowsToGenerate; i++) {
      const key = crypto.randomUUID()
      storedKeysSet.add(key)
      const dataToDb = {
        name: 'john' + '1',
        surname: crypto.randomBytes(10).toString('base64'),
        id: RandomUtil.getRandomInt(0, 100000)
      }
      const randomDayWithinSameMonth = RandomUtil.getRandomDateSameMonth(seedDate)
      const ts = DateUtil.dateTimeToUnixFloat(randomDayWithinSameMonth)
      const putResult = await vnodeClient.postRecord(
        VNode1Constants.apiUrl,
        VNode1Constants.namespace,
        nsIndex,
        ts + '',
        key,
        dataToDb
      )
    }

    // Query Generated rows and count them
    const month = DateUtil.formatYYYYMM(seedDate)
    let resp: AxiosResponse
    let itemsLength
    let query = 0
    let firstTs = null
    let totalRowsFetched = 0
    do {
      resp = await vnodeClient.listRecordsByMonth(
        VNode1Constants.apiUrl,
        VNode1Constants.namespace,
        nsIndex,
        month,
        firstTs
      )
      query++
      itemsLength = resp?.data?.items?.length || 0
      totalRowsFetched += itemsLength
      const lastTs = resp?.data?.result?.lastTs
      console.log('query', query, `got `, itemsLength, 'items, lastTs = ', lastTs)
      firstTs = lastTs
      for (const item of resp?.data?.items || []) {
        const success = storedKeysSet.delete(item.skey)
        console.log(`correct key ${item.skey} , success=${success}`)
      }
      // await PromiseUtil.sleep(10000);
    } while ((resp?.data?.items?.length || 0) > 0)

    console.log('total rows fetched ', totalRowsFetched)

    // Compare rows stored vs rows fetched back via API
    expect(storedKeysSet.size).equals(0)
  })
})

async function performOneTest(baseUri: string, ns: string, testCounter: number): Promise<number> {
  const startTs = Date.now()
  console.log('-->started test', testCounter)
  const key = crypto.randomUUID()
  const dataToDb = {
    name: 'john' + '1',
    surname: crypto.randomBytes(10).toString('base64'),
    id: RandomUtil.getRandomInt(0, 100000)
  }

  const nsIndex = RandomUtil.getRandomInt(0, 100000).toString()

  const dateObj = RandomUtil.getRandomDate(
    DateTime.fromObject({ year: 2022, month: 1, day: 1 }),
    DateTime.fromObject({ year: 2022, month: 12, day: 31 })
  )
  if (!dateObj.isValid) {
    console.log('INVALID DATE !!! ', dateObj)
    return
  }
  const dateFormatted = dateObj.toFormat('yyyyMMdd')
  console.log('dateFormatted', dateFormatted)

  const putResult = await vnodeClient.postRecord(
    baseUri,
    ns,
    nsIndex,
    dateObj.toUnixInteger() + '',
    key,
    dataToDb
  )
  if (putResult.status != 201) {
    console.log('PUT ERROR!!! ', putResult.status)
    return
  }
  const getResult = await vnodeClient.getRecord(baseUri, ns, nsIndex, dateFormatted, key)
  if (getResult.status != 200) {
    console.log('GET ERROR!!! ', getResult.status)
    return
  }
  const dataFromDb = getResult.data.items[0].payload
  const isEqual = _.isEqual(dataToDb, dataFromDb)
  if (!isEqual) {
    console.log(`isEqual = `, isEqual)
    console.log('dataToDb', dataToDb, 'dataFromDb', dataFromDb)
  }
  expect(getResult.data.result.quorumResult).equals('QUORUM_OK')
  console.log('-->finished test', testCounter, ' elapsed ', (Date.now() - startTs) / 1000.0)
  expect(isEqual).equals(true)
  return Promise.resolve(getResult.status)
}
