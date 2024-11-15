import { Service } from 'typedi'

import { BitUtil } from '../../utilz/bitUtil'
import { PgUtil } from '../../utilz/pgUtil'
import { StrUtil } from '../../utilz/strUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'

// noinspection UnnecessaryLocalVariableJS
@Service()
export class Block {
  private static log = WinstonUtil.newLog(Block)

  static async getBlockByHash(blockHash: string) {
    const query = `SELECT * FROM blocks WHERE block_hash = $1`
    const result = await PgUtil.queryOneRow(query, [blockHash])
    return { result: result }
  }

  /**
   *
   * @param blockHashes hashes to check against this node storage,
   * accepts:
   * '0xAA', '0xaa', 'aa', 'AA' byte encodings
   *
   * replies ['DO_NOT_SEND', 'SEND']
   * SEND = A VNode is forced to submit data
   * DO_NOT_SENT = thanks, but we already have this block, don't submit the data
   */
  static async getBulkBlocksByHash(blockHashes: string[]): Promise<String[]> {
    Block.log.debug('getBulkBlocksByHash() call: %s', blockHashes)
    for (let i = 0; i < blockHashes.length; i++) {
      blockHashes[i] = BitUtil.hex0xRemove(blockHashes[i]).toLowerCase()
    }
    // db stores everything in lowercase base16
    const result = await PgUtil.queryArr<{ object_hash: string }>(
      `SELECT object_hash FROM blocks WHERE object_hash = ANY($1::text[])`,
      [blockHashes]
    )
    const foundHashes = new Set<string>(result.map((row) => row.object_hash))

    const statusArray = blockHashes.map((hash) => (foundHashes.has(hash) ? 'DO_NOT_SEND' : 'SEND'))
    Block.log.debug('getBulkBlocksByHash() result: %s', statusArray)
    return statusArray
  }

  static async checkIfTableViewExists(viewName: string): Promise<boolean> {
    const query = `
      SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_views WHERE viewname = $1
      );`

    try {
      const result = await PgUtil.queryOneRow<{ exists: boolean }>(query, viewName)
      return result.exists
    } catch (error) {
      this.log.error(`Error checking if view exists: ${error}`)
      throw error
    }
  }

  static async createRecordInStorageSyncTable(
    viewTableName: string,
    flowType: 'IN' | 'OUT',
    totalCount: number
  ) {
    const query = `INSERT INTO storage_sync_info (view_name, flow_type, total_count) VALUES ($1, $2, $3);`
    try {
      await PgUtil.update(query, viewTableName, flowType, totalCount)
      this.log.info(`Successfully created record in storage_sync_info for view ${viewTableName}`)
    } catch (error) {
      this.log.error(
        `Error creating record in storage_sync_info for view ${viewTableName}: ${error}`
      )
      throw error
    }
  }

  static async getSyncInfo(viewTableName: string) {
    const query = `SELECT view_name, flow_type, created_at, last_synced_page_number, total_count FROM storage_sync_info WHERE view_name = $1;`
    try {
      const result = await PgUtil.queryOneRow<{
        view_name: string
        flow_type: string
        created_at: any
        last_synced_page_number: string
        total_count: string
      }>(query, viewTableName)
      this.log.info(`Successfully fetched record from storage_sync_info for view ${viewTableName}`)
      return result
    } catch (error) {
      this.log.error(
        `Error fetching record from storage_sync_info for view ${viewTableName}: ${error}`
      )
      throw error
    }
  }

  static async dropViewRowFromStorageSyncTable(viewTableName: string) {
    const query = `DELETE FROM storage_sync_info WHERE view_name = $1;`
    try {
      await PgUtil.update(query, viewTableName)
      this.log.info(`Successfully deleted record from storage_sync_info for view ${viewTableName}`)
    } catch (error) {
      this.log.error(
        `Error deleting record from storage_sync_info for view ${viewTableName}: ${error}`
      )
      throw error
    }
  }

  static async getPaginatedBlockHashFromView(
    viewTableName: string,
    pageNumber: number,
    pageSize: number
  ) {
    const query = `SELECT object_hash FROM ${viewTableName} ORDER BY object_hash LIMIT $1 OFFSET $2;`
    const offset = (pageNumber - 1) * pageSize
    try {
      const result = await PgUtil.queryArr<{ object_hash: string }>(query, pageSize, offset)
      this.log.info(`Successfully fetched paginated blocks from view ${viewTableName}`)

      if (result?.length) {
        this.log.info(`Fetched ${result.length} blocks from view ${viewTableName}`)
        // if the data fetching is successful, update the lastSyncedPageNumber in storage_sync_info for that view
        await this.updateInfoInStorageSyncTable(viewTableName, pageNumber, 'IN')
      }
      const totalCount = (await Block.getSyncInfo(viewTableName)).total_count
      const response = result.map((row) => row.object_hash)
      return { blockHash: response, total: totalCount }
    } catch (error) {
      this.log.error(`Error fetching paginated blocks from view ${viewTableName}: ${error}`)
      throw error
    }
  }

  static async getBlockInfoFromViewBasedOnBlockHashs(viewTableName: string, blockHashs: string[]) {
    const query = `SELECT object FROM ${viewTableName} WHERE object_hash = ANY($1::text[]);`
    try {
      const result = await PgUtil.queryArr(query, blockHashs)
      this.log.info(`Successfully fetched block info from view ${viewTableName}`)
      return result
    } catch (error) {
      this.log.error(`Error fetching block info from view ${viewTableName}: ${error}`)
      throw error
    }
  }

  // "IN" is pointing to views that are being synced to the storage node
  // "OUT" is pointing to views that are being synced from the storage node
  static async updateInfoInStorageSyncTable(
    viewTableName: string,
    lastSyncedPageNumber: number,
    flowType: 'IN' | 'OUT'
  ) {
    const query = `UPDATE storage_sync_info SET last_synced_page_number = $1 WHERE view_name = $2 AND flow_type = '${flowType}';`
    try {
      await PgUtil.update(query, lastSyncedPageNumber, viewTableName)
      this.log.info(`Successfully updated record in storage_sync_info for view ${viewTableName}`)
    } catch (error) {
      this.log.error(
        `Error updating record in storage_sync_info for view ${viewTableName}: ${error}`
      )
      throw error
    }
  }

  static async createViewOfBlocksBasedOnShardIds(shards: Set<number>): Promise<void> {
    if (!shards.size) {
      throw new Error('Shards set cannot be empty')
    }

    const viewTableName = `vw_blocks_${StrUtil.concateSet<number>(shards, '')}`

    try {
      const viewExists = await this.checkIfTableViewExists(viewTableName)

      if (viewExists) {
        this.log.info(`View ${viewTableName} already exists`)
        return
      }
      const jsonbShards = JSON.stringify(Array.from(shards))

      const createViewQuery = `
      CREATE OR REPLACE VIEW ${viewTableName} AS
      SELECT
        object_hash,
        object,
        object_shards
      FROM
        blocks
      WHERE
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(object_shards) AS shard
          WHERE shard::int = ANY (ARRAY${jsonbShards}::int[])
        );
      `
      this.log.info(`Executing query: ${createViewQuery}`)

      try {
        await PgUtil.update(createViewQuery)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        this.log.info('Query executed successfully')
        const countQuery = `SELECT COUNT(*) FROM ${viewTableName};`
        const count = await PgUtil.queryOneValue<number>(countQuery)
        await this.createRecordInStorageSyncTable(viewTableName, 'OUT', count)
      } catch (queryError) {
        this.log.error(`Error executing CREATE VIEW query: ${queryError}`)
        throw queryError
      }
    } catch (error) {
      this.log.error(`Error creating view ${viewTableName}: ${error}`)
      throw error
    }
  }

  static async dropView(viewName: string): Promise<void> {
    try {
      const query = `DROP VIEW IF EXISTS ${viewName};`
      await PgUtil.update(query)
      this.log.info(`Successfully dropped view ${viewName}`)
    } catch (error) {
      this.log.error(`Error dropping view ${viewName}: ${error}`)
      throw error
    }
  }
}
