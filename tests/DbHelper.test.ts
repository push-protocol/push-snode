import 'mocha'

import chai from 'chai'

import DbHelper from '../src/helpers/dbHelper'

chai.should()
const crypto = require('crypto')
const expect = chai.expect

describe('DbHelpers tests', function () {
  it('test 8 bit for 1 key ', function () {
    const shardId = DbHelper.calculateShardForNamespaceIndex('feeds', 'store0001')
    expect(shardId).lessThanOrEqual(255)
    expect(shardId).greaterThanOrEqual(0)
    console.log(shardId)
  })

  it('test 8 bit for 10 random keys', function () {
    for (let i = 0; i < 10; i++) {
      const shardId = DbHelper.calculateShardForNamespaceIndex(
        crypto.randomBytes(20).toString('hex'),
        crypto.randomBytes(20).toString('hex')
      )
      expect(shardId).lessThanOrEqual(255)
      expect(shardId).greaterThanOrEqual(0)
      console.log(shardId)
    }
  })
})
