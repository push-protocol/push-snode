import { Inject, Service } from 'typedi'

import { BitUtil } from '../../utilz/bitUtil'
import { Coll } from '../../utilz/coll'
import { DateUtil } from '../../utilz/dateUtil'
import { PgUtil } from '../../utilz/pgUtil'
import { RandomUtil } from '../../utilz/randomUtil'
import { StrUtil } from '../../utilz/strUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { IndexStorage } from '../messaging/IndexStorage'

// noinspection UnnecessaryLocalVariableJS
@Service()
export class Block {
  private static log = WinstonUtil.newLog(Block)

  @Inject()
  private static indexStorage: IndexStorage

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

  static async createRecordInStorageSyncTable(
    viewTableName: string,
    flowType: 'IN' | 'OUT',
    totalCount: number,
    shardIds: Set<number>,
    snodeUrl?: string,
    expiryTime?: Date
  ) {
    if (totalCount <= 0) {
      this.log.info(`Total count is ${totalCount}, not creating record in storage_sync_info`)
      return
    }
    const shardSetAsJson = JSON.stringify(Coll.setToArray(shardIds))
    const query = `INSERT INTO storage_sync_info (view_name, flow_type, total_count, snode_url, shard_ids, current_syncing_shard_id, expiry_ts) VALUES ($1, $2, $3, $4, $5, $6, $7);`
    try {
      await PgUtil.update(
        query,
        viewTableName,
        flowType,
        totalCount,
        snodeUrl ?? null,
        shardSetAsJson,
        shardIds.values().next().value,
        expiryTime ?? null
      )
      this.log.info(`Successfully created record in storage_sync_info for view ${viewTableName}`)
    } catch (error) {
      this.log.error(
        `Error creating record in storage_sync_info for view ${viewTableName}: %s`,
        error
      )
      throw error
    }
  }

  static async getStorageSyncInfo(viewTableName: string) {
    const query = `SELECT view_name, flow_type, created_at, last_synced_page_number, total_count, already_synced_shards FROM storage_sync_info WHERE view_name = $1;`
    try {
      const result = await PgUtil.queryOneRow<{
        view_name: string
        flow_type: string
        created_at: any
        last_synced_page_number: string
        total_count: string
        already_synced_shards: number[]
      }>(query, viewTableName)
      this.log.info(`Successfully fetched record from storage_sync_info for view ${viewTableName}`)
      return result
    } catch (error) {
      this.log.error(
        `Error fetching record from storage_sync_info for view ${viewTableName}: %o`,
        error
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
        `Error deleting record from storage_sync_info for view ${viewTableName}: %s`,
        error
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

    const shardIdQuery = `SELECT shard_ids FROM storage_sync_info WHERE view_name = $1;`
    const shardIdResult = Coll.arrayToSet(
      await PgUtil.queryOneValue<number[]>(shardIdQuery, viewTableName)
    )

    if (shardIdResult) {
      // keep increaing the expiry time for the view
      await Block.updateInfoInStorageSyncTable(
        { viewTableName, flowType: 'OUT' },
        { expiry_ts: new Date(Math.floor(Date.now()) + DateUtil.ONE_DAY_IN_MILLISECONDS) }
      )
    }

    const query = `
      WITH filtered_blocks AS (
        SELECT DISTINCT object_hash, object_shards, ts
        FROM ${viewTableName}
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(object_shards) AS shard
          WHERE shard::int = ANY ($3)
        )
      )
      SELECT object_hash
      FROM filtered_blocks
      ORDER BY ts DESC
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

      this.log.debug({
        message: `Successfully fetched paginated blocks from view ${viewTableName} %s %s`,
        pageNumber,
        pageSize
      })

      this.log.debug(result)

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
      this.log.error(`Error fetching block info from view ${viewTableName} %s:`, error)
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
      alreadySynedShardId?: number
      expiry_ts?: Date
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
                    to_jsonb($4::numeric) 
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
        `Error updating record in storage_sync_info for view ${viewTableName}: %s`,
        error
      )
      throw error
    }
  }

  static async dropSyncedTables() {
    // delete the records from storage_sync_info whose sync_status is SYNCED
    // drop the view_table corrosponding to it
    try {
      const query = `SELECT view_name FROM storage_sync_info WHERE sync_status = 'SYNCED';`
      const result = await PgUtil.queryArr<{ view_name: string }>(query)
      this.log.info(`Found ${result.length} synced tables to drop`)
      for (const row of result) {
        await Block.dropView(row.view_name)
        await Block.dropViewRowFromStorageSyncTable(row.view_name)
      }
      this.log.info('Successfully dropped synced tables')
    } catch (error) {
      this.log.error(`Error dropping synced tables: %s`, error)
    }
  }

  static async dropExpiredTables() {
    // delete the row from storage_sync_info whose expiry_ts has exceeded i.e they are not being used
    // drop the view_table corrosponding to it
    const currentTime = new Date()
    const query = `SELECT view_name FROM storage_sync_info WHERE expiry_ts < $1;`
    try {
      const result = await PgUtil.queryArr<{ view_name: string }>(query, currentTime)
      this.log.info(`Found ${result.length} expired tables to drop`)
      for (const row of result) {
        await Block.dropView(row.view_name)
        await Block.dropViewRowFromStorageSyncTable(row.view_name)
      }
      this.log.info('Successfully dropped expired tables')
    } catch (error) {
      this.log.error(`Error dropping expired tables: %s`, error)
    }
  }

  static async getViewsBasedOnSyncAndFlowStatus(status: 'SYNCED' | 'SYNCING', flow: 'IN' | 'OUT') {
    try {
      const query = `SELECT view_name, total_count, shard_ids FROM storage_sync_info WHERE sync_status = $1 AND flow_type = $2;`
      const result = await PgUtil.queryArr<{
        view_name: string
        total_count: number
        shard_ids: number[]
      }>(query, status, flow)
      return result
    } catch (error) {
      this.log.error(`Error getting view info based on status: %s`, error)
    }
  }

  static async createViewOfBlocksBasedOnShardIds(shards: Set<number>, snodeUrl?: string) {
    if (!shards.size) {
      return { viewId: null, count: null, error: 'Shards set cannot be empty' }
    }
    // sort the shards
    shards = new Set([...shards].sort((a, b) => a - b))

    const viewTableName = `vw_blocks_${StrUtil.concateSet<number>(shards, '_').substring(0, 10)}_${RandomUtil.getRandomInt(0, 1000000)}`

    try {
      const viewExists = await Block.getStorageSyncInfo(viewTableName)

      if (viewExists && viewExists.view_name) {
        this.log.info(`View ${viewTableName} already exists`)
        return { viewId: viewTableName, count: viewExists.total_count }
      }
      const jsonbShards = JSON.stringify(Array.from(shards))

      const createViewQuery = `
      CREATE TABLE ${viewTableName} AS
      SELECT
        object_hash,
        object_shards,
        object_raw,
        ts
      FROM
        blocks
      WHERE
        ts < NOW() AND 
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(object_shards) AS shard
          WHERE shard::int = ANY (ARRAY${jsonbShards}::int[])
        )
      ORDER BY ts DESC;

      CREATE INDEX idx_${viewTableName}_ts ON ${viewTableName} (ts DESC);
      `
      this.log.info(`Executing query: ${createViewQuery}`)

      try {
        await PgUtil.update(createViewQuery)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        this.log.info('Query executed successfully')
        const countQuery = `SELECT COUNT(*) FROM ${viewTableName};`
        const count = await PgUtil.queryOneValue<number>(countQuery)
        if (count !== 0) {
          await Block.createRecordInStorageSyncTable(
            viewTableName,
            'OUT',
            count,
            shards,
            snodeUrl && snodeUrl.length != 0 ? snodeUrl : null,
            new Date(Math.floor(Date.now()) + DateUtil.ONE_DAY_IN_MILLISECONDS)
          )
          return { viewId: viewTableName, count }
        } else {
          Block.dropView(viewTableName)
          return { viewId: null, count: null, error: 'View has no data' }
        }
      } catch (queryError) {
        this.log.error(`Error executing CREATE VIEW query: %s`, queryError)
        return { viewId: null, count: null, error: queryError }
      }
    } catch (error) {
      this.log.error(`Error creating view ${viewTableName}: %s`, error)
      return { viewId: null, count: null, error }
    }
  }

  static async dropView(viewName: string): Promise<void> {
    try {
      const query = `DROP TABLE IF EXISTS ${viewName};`
      await PgUtil.update(query)
      this.log.info(`Successfully dropped view  table ${viewName}`)
    } catch (error) {
      this.log.error(`Error dropping view table ${viewName}: %s`, error)
      throw error
    }
  }
}
