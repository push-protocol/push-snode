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
      await snodeSyncUtil.init(new Set([1, 2, 3, 4]))

      console.log(snodeSyncUtil.mapNodeInfoToShards)
      console.log(snodeSyncUtil.nodeIds)
    })
  })
})
