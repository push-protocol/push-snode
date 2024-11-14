import { expect } from 'chai'

import { StrUtil } from '../../src/utilz/strUtil'

describe.only('StrUtil', () => {
  describe('concateSet testcase', () => {
    it('Should return the concated string from set', () => {
      const set = new Set([1, 2, 3, 4])
      const result = StrUtil.concateSet(set, '')
      expect(result).to.equal('1234')
    })
    it("Should return the concated string from set separated by ','", () => {
      const set = new Set([1, 2, 3, 4])
      const result = StrUtil.concateSet(set, ',')
      expect(result).to.equal('1,2,3,4')
    })
  })
  describe('stringifySet Testcase', () => {
    it('Should return the stringified set', () => {
      const set = new Set([1, 2, 3, 4])
      const result = StrUtil.stringifySet(set)
      expect(result).to.equal('[1,2,3,4]')
    })
  })
})
