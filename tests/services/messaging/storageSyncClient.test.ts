import Container from 'typedi'

import StorageNode from '../../../src/services/messaging/storageNode'
import { StorageSyncClient } from '../../../src/services/messaging/storageSyncClient'
describe('StorageSyncClient Test', () => {
  beforeEach(async () => {
    await Container.get(StorageNode).postConstruct()
  })
  const storageSyncClient = new StorageSyncClient(
    'http://localhost:3002',
    ['0', '1', '2', '3', '4'],
    'vw_blocks_0_1_2_3_4_592581',
    'IN',
    0,
    10
  )
  describe('Test push_putBlockHash', () => {
    it('Should return the block hashes response', async () => {
      const result = await storageSyncClient.push_putBlockHash(['36145289'])
      console.log(result)
    })

    it('Should return the block hashes response', async () => {
      const result = await storageSyncClient.push_putBlockHash(['ttttt'])
      console.log(result)
    })
  })

  describe('push_getPaginatedBlockHashFromView', () => {
    it('Should return the block hashes from block view', async () => {
      const result = await storageSyncClient.push_getPaginatedBlockHashFromView(0, 1)
      console.log(result)
    })
  })

  describe('push_getBlocksFromHashes', () => {
    it('Should return the block hashes from block view', async () => {
      const result = await storageSyncClient.push_getPaginatedBlockHashFromView(3, 1)
      console.log('blockhash result: ', result)
      const blockResult = await storageSyncClient.push_getBlocksFromHashes(
        result,
        storageSyncClient.getViewName()
      )
      console.log(blockResult)
    })
  })
})
