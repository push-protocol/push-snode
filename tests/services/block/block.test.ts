import { expect } from 'chai'
import Container from 'typedi'

import { Block } from '../../../src/services/block/block'
import StorageNode from '../../../src/services/messaging/storageNode'

describe('Block Service Testcase', () => {
  beforeEach(async () => {
    await Container.get(StorageNode).postConstruct()
  })
  // describe('chekcIfTableViewExists', () => {
  //   it('Shoudld return false as view doesnt exists', async () => {
  //     const result = await Block.checkIfTableViewExists('test812345234567')
  //     expect(result).to.be.false
  //   })
  // })

  describe('createViewOfBlocksBasedOnShardIds', () => {
    it('Should create a view of the blocks table', async () => {
      const shards = new Set([1, 2, 3, 4, 5, 6, 7])
      await Block.createViewOfBlocksBasedOnShardIds(shards)
      // const res = await Block.checkIfTableViewExists('vw_blocks_1234567')
      // expect(res).to.be.true
      // await Block.dropView('vw_blocks_1234567')
      // await Block.dropViewRowFromStorageSyncTable('vw_blocks_1234567')
    })
  })

  describe('createRecordInStorageSyncTable', () => {
    it('Should create a record in the storage_sync_info table', async () => {
      await Block.createRecordInStorageSyncTable(
        'vw_blocks_1234567',
        'IN',
        10,
        new Set([1, 2, 3, 4, 5, 6, 7]),
        'test.com',
        new Date(Math.floor(Date.now()))
      )
      const res = await Block.getStorageSyncInfo('vw_blocks_1234567')
      expect(res).to.be.not.null
      await Block.dropViewRowFromStorageSyncTable('vw_blocks_1234567')
    })
  })

  describe('getSyncInfo', () => {
    it('Should get the sync info of the view', async () => {
      await Block.createViewOfBlocksBasedOnShardIds(new Set([1, 2, 3, 4, 5, 6, 7]))
      // await Block.createRecordInStorageSyncTable('vw_blocks_1234567', 'IN')
      const res = await Block.getStorageSyncInfo('vw_blocks_1234567')
      await Block.dropView('vw_blocks_1234567')
      await Block.dropViewRowFromStorageSyncTable('vw_blocks_1234567')
    })
  })

  describe('updateInfoInStorageSyncTable', () => {
    it('Should update the last synced timestamp in the view', async () => {
      await Block.createViewOfBlocksBasedOnShardIds(new Set([12, 3, 4]))
      // await Block.updateInfoInStorageSyncTable('vw_blocks_1234567', 1258341576, 'IN')
      // await Block.dropView('vw_blocks_1234567')
      // await Block.dropViewRowFromStorageSyncTable('vw_blocks_1234567')
    })
  })

  describe('getPaginatedBlockHashFromView', () => {
    it('Should get paginated blocks from the view', async () => {
      await Block.createViewOfBlocksBasedOnShardIds(new Set([1, 2, 3, 4, 5, 6, 7]))
      // await Block.createRecordInStorageSyncTable('vw_blocks_1234567', 'IN')
      const p1 = await Block.getPaginatedBlockHashFromView('vw_blocks_1_2_3_4_5_6_7', [3], 1, 1)
      console.log(p1)
      const p2 = await Block.getPaginatedBlockHashFromView('vw_blocks_1_2_3_4_5_6_7', [3], 2, 1)
      console.log(p2)
      // await Block.dropView('vw_blocks_1234567');
      // await Block.dropViewRowFromStorageSyncTable('vw_blocks_1234567')
    })
  })

  describe('getBulkBlocksByHash', () => {
    it('Should get the bulk blocks by hash', async () => {
      const res = await Block.getBlockInfoFromViewBasedOnBlockHashs('vw_blocks_1_2_3_4_5_6_7', [
        '36145289'
      ])
      console.log(res)
    })
  })

  describe('update sync info', () => {
    it('Should update the last sync page', async () => {
      await Block.updateInfoInStorageSyncTable(
        {
          viewTableName: 'vw_blocks_1_2_3_4_5_6_7',
          flowType: 'OUT'
        },
        {
          lastSyncedPageNumber: 10
        }
      )
    })

    it('Should update the last sync page', async () => {
      await Block.updateInfoInStorageSyncTable(
        {
          viewTableName: 'vw_blocks_1_2_3_4_5_6_7',
          flowType: 'OUT'
        },
        {
          currentlySyncingShardId: '2'
        }
      )
    })
  })
})
