import 'mocha'

import { expect } from 'chai'
import Container from 'typedi'

import StorageNode from '../../../src/services/messaging/storageNode'

const currentNodeMap = new Map()
currentNodeMap.set(
  '0x72F569DE6d77B1D4C3810767865FC706A1C39915',
  new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
)
currentNodeMap.set(
  '0x980130B22B010Aa9fE6a7ECcc192Bebf0DB5EaB6',
  new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
)
currentNodeMap.set(
  '0x836B1eDe570164959B8F288579BF3fA583c03C1C',
  new Set([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31])
)
currentNodeMap.set(
  '0x53474D90663de06BEf5D0017F450730D83168063',
  new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
)
currentNodeMap.set(
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
)
currentNodeMap.set(
  '0x82a7A0828fa8EB902f0508620Ee305b08634318A',
  new Set([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31])
)

describe('StorageNode Test', () => {
  const storageNode = Container.get(StorageNode)
  describe('getShardStatus testcases', () => {
    it('Should return shardsToAdd, shardsToDelete and commonShards', async () => {
      const oldShard = [1, 2, 3, 4]
      const newShards = [3, 4, 5, 6]
      const result = storageNode.getShardStatus(new Set(oldShard), new Set(newShards))
      expect(result.shardsToAdd).to.deep.equal(new Set([5, 6]))
      expect(result.shardsToDelete).to.deep.equal(new Set([1, 2]))
      expect(result.commonShards).to.deep.equal(new Set([3, 4]))
    })
    it('Should return empty set for same oldShard and newShards', async () => {
      const oldShard = [1, 2, 3, 4]
      const newShards = [1, 2, 3, 4]
      const result = storageNode.getShardStatus(new Set(oldShard), new Set(newShards))
      expect(result.shardsToAdd).to.deep.equal(new Set([]))
      expect(result.shardsToDelete).to.deep.equal(new Set([]))
      expect(result.commonShards).to.deep.equal(new Set([1, 2, 3, 4]))
    })
  })
  describe.only('handleReshard testcases', () => {
    it('Should end as the newShards is same as existing shards', async () => {
      const newShards = [6, 7, 8]
      const oldShards = new Set([9, 10, 11, 12, 13])
      await storageNode.postConstruct()
      await storageNode.handleReshard(new Set(newShards), currentNodeMap, oldShards)
    })
  })
})
