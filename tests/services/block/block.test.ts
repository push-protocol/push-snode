import { expect } from 'chai'
import Container from 'typedi'

import { Block } from '../../../src/services/block/block'
import StorageNode from '../../../src/services/messaging/storageNode'

describe.only('Block Service Testcase', () => {
  beforeEach(async () => {
    await Container.get(StorageNode).postConstruct()
  })
  describe('chekcIfTableViewExists', () => {
    it('Shoudld return false as view doesnt exists', async () => {
      const result = await Block.checkIfTableViewExists('test812345234567')
      expect(result).to.be.false
    })
  })

  describe('createViewOfBlocksBasedOnShardIds', () => {
    it('Should create a view of the blocks table', async () => {
      const shards = new Set([1, 2, 3, 4, 5, 6, 7])
      await Block.createViewOfBlocksBasedOnShardIds(shards)
      const res = await Block.checkIfTableViewExists('vw_blocks_1234567')
      console.log(res)
      await Block.dropView('vw_blocks_1234567')
    })
  })

  describe('createRecordInStorageSyncTable', () => {
    it('Should create a record in the storage_sync_info table', async () => {
      await Block.createRecordInStorageSyncTable('vw_blocks_1234567', 'IN')
    })
  })

  describe('getSyncInfo', () => {
    it('Should get the sync info of the view', async () => {
      await Block.createViewOfBlocksBasedOnShardIds(new Set([1, 2, 3, 4, 5, 6, 7]))
      await Block.createRecordInStorageSyncTable('vw_blocks_1234567', 'IN')
      const res = await Block.getSyncInfo('vw_blocks_1234567')
      console.log(res)
      await Block.dropView('vw_blocks_1234567')
      await Block.dropViewRowFromStorageSyncTable('vw_blocks_1234567')
    })
  })
})
