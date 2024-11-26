import { Service } from 'typedi'

import { BitUtil } from '../../utilz/bitUtil'
import { Coll } from '../../utilz/coll'
import { PgUtil } from '../../utilz/pgUtil'
import { RandomUtil } from '../../utilz/randomUtil'
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
    totalCount: number,
    shardIds: Set<number>,
    snodeUrl?: string
  ) {
    if (totalCount <= 0) {
      this.log.info(`Total count is ${totalCount}, not creating record in storage_sync_info`)
      return
    }
    const shardSetAsJson = JSON.stringify(Coll.setToArray(shardIds))
    const query = `INSERT INTO storage_sync_info (view_name, flow_type, total_count, snode_url, shard_ids, current_syncing_shard_id) VALUES ($1, $2, $3, $4, $5, $6);`
    try {
      await PgUtil.update(
        query,
        viewTableName,
        flowType,
        totalCount,
        snodeUrl ?? null,
        shardSetAsJson,
        shardIds.values().next().value
      )
      this.log.info(`Successfully created record in storage_sync_info for view ${viewTableName}`)
    } catch (error) {
      this.log.error(
        `Error creating record in storage_sync_info for view ${viewTableName}: ${error}`
      )
      throw error
    }
  }

  static async getStorageSyncInfo(viewTableName: string) {
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
    shardIds: number[],
    pageNumber: number,
    pageSize: number
  ): Promise<string[]> {
    this.log.info({ viewTableName, pageNumber, pageSize, shardIds })
    if (!viewTableName || !Array.isArray(shardIds) || shardIds.length === 0) {
      throw new Error('Invalid input parameters')
    }

    if (pageNumber < 1 || pageSize < 1) {
      throw new Error('Page number and page size must be positive integers')
    }

    const query = `
      WITH filtered_blocks AS (
        SELECT DISTINCT object_hash, object_shards
        FROM ${viewTableName}
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(object_shards) AS shard
          WHERE shard::int = ANY ($3)
        )
      )
      SELECT object_hash
      FROM filtered_blocks
      ORDER BY object_shards
      LIMIT $1 OFFSET $2;
    `

    const offset = (pageNumber - 1) * pageSize

    try {
      // Execute main query
      const result = await PgUtil.queryArr<{ object_hash: string }>(
        query,
        pageSize,
        offset,
        shardIds
      )

      console.log({
        message: `Successfully fetched paginated blocks from view ${viewTableName}`,
        pageNumber,
        pageSize
      })

      console.log(result)

      if (result?.length) {
        // Update sync info only if we actually got results
        await Block.updateInfoInStorageSyncTable(
          { viewTableName, flowType: 'OUT' },
          { lastSyncedPageNumber: pageNumber }
        )
      }
      return result.map((row) => row.object_hash)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log.error({
        message: `Error fetching paginated blocks from view ${viewTableName}`,
        error: errorMessage,
        pageNumber,
        pageSize,
        shardIds
      })
      throw error
    }
  }

  static async getBlockInfoFromViewBasedOnBlockHashs(viewTableName: string, blockHashs: string[]) {
    const query = `SELECT object_raw FROM ${viewTableName} WHERE object_hash = ANY($1::text[]);`
    try {
      const result = await PgUtil.queryArr<{ object_raw: string }>(query, blockHashs)
      this.log.info(`Successfully fetched block info from view ${viewTableName}`)
      const resultArray = result.map((row) => row.object_raw ?? '')
      return resultArray
    } catch (error) {
      this.log.error(`Error fetching block info from view ${viewTableName}: ${error}`)
      throw error
    }
  }

  // "IN" is pointing to views that are being synced to the storage node
  // "OUT" is pointing to views that are being synced from the storage node
  static async updateInfoInStorageSyncTable(
    condition: { viewTableName: string; flowType: 'IN' | 'OUT' },
    fieldToBeUpdated: {
      lastSyncedPageNumber?: number
      currentlySyncingShardId?: string
      syncStatus?: 'SYNCING' | 'SYNCED'
      alreadySynedShardId?: string
    }
  ) {
    const { viewTableName, flowType } = condition
    let { lastSyncedPageNumber, currentlySyncingShardId, syncStatus, alreadySynedShardId } =
      fieldToBeUpdated
    const query = `
      UPDATE storage_sync_info
      SET
        last_synced_page_number = COALESCE($1, last_synced_page_number),
        current_syncing_shard_id = COALESCE($2, current_syncing_shard_id),
        sync_status = COALESCE($3, sync_status),
        already_synced_shards = 
          CASE 
            WHEN $4 IS NOT NULL THEN 
              jsonb_insert(
                COALESCE(already_synced_shards, '[]'::jsonb), 
                '{-1}', 
                to_jsonb($4::text)
              )
            ELSE 
              already_synced_shards 
          END
      WHERE view_name = $5 AND flow_type = $6;
    `
    try {
      await PgUtil.update(
        query,
        lastSyncedPageNumber,
        currentlySyncingShardId,
        syncStatus,
        alreadySynedShardId,
        viewTableName,
        flowType
      )
      this.log.info(`Successfully updated record in storage_sync_info for view ${viewTableName}`)
    } catch (error) {
      this.log.error(
        `Error updating record in storage_sync_info for view ${viewTableName}: ${error}`
      )
      throw error
    }
  }

  static async createViewOfBlocksBasedOnShardIds(shards: Set<number>, snodeUrl?: string) {
    if (!shards.size) {
      return { viewId: null, count: null, error: 'Shards set cannot be empty' }
    }
    // sort the shards
    shards = new Set([...shards].sort((a, b) => a - b))

    const viewTableName = `vw_blocks_${StrUtil.concateSet<number>(shards, '_')}_${RandomUtil.getRandomInt(0, 1000000)}`

    try {
      const viewExists = await Block.getStorageSyncInfo(viewTableName)

      if (viewExists && viewExists.view_name) {
        this.log.info(`View ${viewTableName} already exists`)
        return { viewId: viewTableName, count: viewExists.total_count }
      }
      const jsonbShards = JSON.stringify(Array.from(shards))

      const createViewQuery = `
      CREATE OR REPLACE VIEW ${viewTableName} AS
      SELECT
        object_hash,
        object_shards,
        object_raw
      FROM
        blocks
      WHERE
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(object_shards) AS shard
          WHERE shard::int = ANY (ARRAY${jsonbShards}::int[])
        )
      ORDER BY object_hash DESC;
      `
      this.log.info(`Executing query: ${createViewQuery}`)

      try {
        await PgUtil.update(createViewQuery)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        this.log.info('Query executed successfully')
        const countQuery = `SELECT COUNT(*) FROM ${viewTableName};`
        const count = await PgUtil.queryOneValue<number>(countQuery)
        await Block.createRecordInStorageSyncTable(
          viewTableName,
          'OUT',
          count,
          shards,
          snodeUrl && snodeUrl.length != 0 ? snodeUrl : null
        )
        return { viewId: viewTableName, count }
      } catch (queryError) {
        this.log.error(`Error executing CREATE VIEW query: ${queryError}`)
        return { viewId: null, count: null, error: queryError }
      }
    } catch (error) {
      this.log.error(`Error creating view ${viewTableName}: ${error}`)
      return { viewId: null, count: null, error }
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
