// import { expect } from 'chai'

import { BlockPolling } from '../../../src/services/block/blockPolling'

describe('BlockPolling Testcases', () => {
  const blockPolling = new BlockPolling()
  describe('getNodePoolingInfo Testcases', () => {
    it('Should return the node pooling info', async () => {
      const result = await blockPolling.getNodePoolingInfo()
      console.log(result)
    })
  })

  describe('constructNodeShardMap Testcases', () => {
    it('Should construct the node shard map', async () => {
      await blockPolling.constructNodeShardMap()
      console.log(blockPolling.getNodeMap())
    })
  })
})
