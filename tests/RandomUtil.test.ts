import 'mocha'

import chai from 'chai'
import { RandomUtil } from 'dstorage-common'

chai.should()
const crypto = require('crypto')
const expect = chai.expect

describe('RandomUtil tests', function () {
  it('random-1', function () {
    console.log(RandomUtil.getRandomSubArray([1, 2, 3, 4, 5], 1))
    console.log(RandomUtil.getRandomSubArray([1, 2, 3, 4, 5], 2))
    console.log(RandomUtil.getRandomSubArray([1, 2, 3, 4, 5], 3))
    console.log(RandomUtil.getRandomSubArray([1, 2, 3, 4, 5], 4))
    console.log(RandomUtil.getRandomSubArray([1, 2, 3, 4, 5], 5))
    let failed = false
    try {
      console.log(RandomUtil.getRandomSubArray([1, 2, 3, 4, 5], 6))
    } catch (e) {
      failed = true
    }
    if (!failed) expect(failed).equals(true)
  })
})
