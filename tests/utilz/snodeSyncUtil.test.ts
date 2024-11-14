import Container from 'typedi'

import StorageNode from '../../src/services/messaging/storageNode'
import { SNodeSyncUtil } from '../../src/utilz/snodeSyncUtil'
describe.only('SnodeSyncUtil', () => {
  beforeEach(async () => {
    await Container.get(StorageNode).postConstruct()
  })
  describe('getNodeIdFromShardId', () => {
    it('should get the node info ', async () => {
      const snodeSyncUtil = Container.get(SNodeSyncUtil)
      await snodeSyncUtil.postConstruct(new Set([1, 2, 3, 4]))

      console.log(snodeSyncUtil.mapNodeInfoToShards)
      console.log(snodeSyncUtil.nodeIds)
    })
  })
})
