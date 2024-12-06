import Container from 'typedi'

import StorageNode from '../../src/services/messaging/storageNode'
import { SNodeInfoUtil } from '../../src/utilz/snodeInfoUtil'
describe('SnodeSyncUtil', () => {
  beforeEach(async () => {
    await Container.get(StorageNode).postConstruct()
  })
  describe('getNodeIdFromShardId', () => {
    it('should get the node info ', async () => {
      const snodeSyncUtil = Container.get(SNodeInfoUtil)
      await snodeSyncUtil.init(
        new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1, 7, 18, 19, 20])
      )

      console.log(snodeSyncUtil.mapNodeInfoToShards)
      console.log(snodeSyncUtil.nodeIds)
    })
  })
})
