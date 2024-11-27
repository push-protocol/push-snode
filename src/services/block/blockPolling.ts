import Container from 'typedi'

import { BitUtil } from '../../utilz/bitUtil'
import { PgUtil } from '../../utilz/pgUtil'
import { PromiseUtil } from '../../utilz/promiseUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import StorageNode from '../messaging/storageNode'
import { HashReply, StorageSyncClient } from '../messaging/storageSyncClient'
import { BlockUtil } from '../messaging-common/blockUtil'

export interface NodeSyncInfo {
  view_name: string
  flow_type: 'IN' | 'OUT'
  created_at: Date
  last_synced_page_number: string
  shard_ids: string[]
  total_count: string
  snode_url: string
  current_syncing_shard_id: string
  already_synced_shards: string[]
}

enum syncStatus {
  SYNCING = 'SYNCING',
  SYNCED = 'SYNCED'
}

export class BlockPooling {
  private static readonly FLOW_TYPE_IN = 'IN'
  private readonly log = WinstonUtil.newLog(BlockPooling.name)
  private nodeMap = new Map<string, StorageSyncClient[]>()

  /**
   * Fetches node pooling information from the database
   * @throws {Error} If database query fails
   * @returns Promise<NodeSyncInfo[]>
   */
  async getNodePoolingInfo(): Promise<NodeSyncInfo[]> {
    const query = `
      SELECT * 
      FROM storage_sync_info 
      WHERE flow_type = $1;
    `
    try {
      const result = await PgUtil.queryArr<NodeSyncInfo>(query, BlockPooling.FLOW_TYPE_IN)
      this.log.info('Successfully fetched records from storage_sync_info:', {
        count: result.length
      })
      this.log.info(result)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log.error('Error fetching records from storage_sync_info:', { error: errorMessage })
      throw new Error(`Failed to fetch node pooling info: ${errorMessage}`)
    }
  }

  /**
   * Calculates total number of storage clients across all shards
   * @returns number Total number of clients
   */
  getTotalClientCount(): number {
    let totalClients = 0
    for (const clients of this.nodeMap.values()) {
      totalClients += clients.length
    }
    return totalClients
  }

  getShardsThatNeedsToBeSynced(nodeInfo: NodeSyncInfo[]): string[] {
    let alreadySyncedShards = new Set<string>()
    let totalShards = new Set<string>()
    for (const node of nodeInfo) {
      for (const shard of node.shard_ids) {
        totalShards.add(shard)
      }
      for (const shard of node.already_synced_shards) {
        alreadySyncedShards.add(shard)
      }
    }
    return Array.from(new Set([...totalShards].filter((shard) => !alreadySyncedShards.has(shard))))
  }
  /**
   * Constructs a map of shard IDs to their corresponding storage clients
   * @throws {Error} If node pooling info cannot be fetched
   */
  async constructNodeShardMap(): Promise<void> {
    const syncInfo = await this.getNodePoolingInfo()
    const shardsToSync = this.getShardsThatNeedsToBeSynced(syncInfo)
    for (const nodeInfo of syncInfo) {
      for (const shardId of nodeInfo.shard_ids) {
        if (!shardsToSync.includes(shardId)) {
          this.log.info(`Skipping shard ${shardId} as it has already been synced`)
          continue
        }
        const newClient = new StorageSyncClient(
          nodeInfo.snode_url,
          nodeInfo.shard_ids,
          nodeInfo.view_name,
          nodeInfo.flow_type,
          parseInt(nodeInfo.last_synced_page_number),
          parseInt(nodeInfo.total_count),
          nodeInfo.already_synced_shards && nodeInfo.already_synced_shards.length > 0
            ? nodeInfo.already_synced_shards
            : []
        )

        const existingClients = this.nodeMap.get(shardId) || []
        this.nodeMap.set(shardId, [...existingClients, newClient])
      }
    }

    this.log.info('Node shard map constructed successfully', {
      totalShards: this.nodeMap.size,
      totalClients: this.getTotalClientCount()
    })
  }

  /**
   * Returns the current node map
   * @returns Map<string, StorageClient[]>
   */
  public getNodeMap(): Map<string, StorageSyncClient[]> {
    if (this.nodeMap.size === 0) {
      this.log.warn('Getting node map before initialization')
    }
    return this.nodeMap
  }

  /**
   * Initializes the pooling mechanism
   * @throws {Error} If initialization fails
   */
  public async initiatePooling(): Promise<void> {
    try {
      // initialise the node shard map
      if (this.nodeMap.size === 0) {
        await this.constructNodeShardMap()
      }

      // start pooling from the nodes
      for (const [shardId, clients] of this.nodeMap.entries()) {
        this.log.info('Initiating pooling for shard:', { shardId })
        for (const client of clients) {
          // updating the currently syncing shard ids
          await client.updateCurrentlySyncingShard(parseInt(shardId))
          await client.updateLastSyncedPageNumber(1)
        }

        // retry for 3 times before moving to the next shard
        let retryCount = 0
        const maxRetries = 3
        let res = false

        while (retryCount < maxRetries) {
          res = await this.validateAndStoreBlockHashes(shardId, clients)
          if (res === true) {
            // Success, break the retry loop
            for (const client of clients) {
              // updating the currently syncing shard ids
              await client.updateAlreadySyncedShards(shardId)
            }
            break
          }

          this.log.warn(
            `Validation failed for shard ${shardId}, retry ${retryCount + 1}/${maxRetries}`
          )

          retryCount++

          if (retryCount < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 5000)) // 5-second delay between retries
          }
        }

        // If all retries fail,continue to next shard
        if (res === false) {
          this.log.error(
            `Failed to validate and store block hashes for shard ${shardId} after ${maxRetries} attempts. Skipping to next shard.`
          )
          continue // Move to next iteration (next shard)
        }
      }

      this.log.info('Pooling initiated successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log.error('Failed to initiate pooling:', { error: errorMessage })
      throw new Error(`Failed to initiate pooling: ${errorMessage}`)
    }
  }

  /**
   * 1. choose a seednode
   * 2. get paginated blockhashes
   * 3. check with other nodes if they have the blockhashes
   * 4. get the full block for all valid hashes
   */
  public async validateAndStoreBlockHashes(
    shardId,
    clients: StorageSyncClient[],
    seedNodeIndex?: number
  ) {
    try {
      //TODO: choose a random node as seed node
      const seedStorageClient = clients[seedNodeIndex ?? 0]
      // get paginated block hashes from the seed storage node
      const blockHashes = await seedStorageClient.push_getPaginatedBlockHashFromView(
        shardId,
        seedStorageClient.getLastSyncedPageNumber()
      )
      if (blockHashes.length === 0) {
        this.log.info(
          `No block hashes to sync from node ${seedStorageClient.getNodeUrl()} for shardid ${shardId}`
        )
        // TODO:
        // check for all the nodes to see if they dont have any more record for the specific shard
        // if all the nodes dont have any more records, then update the page number in the storage_sync_info table
        return true
      }
      let blockHashesPromiseRes: Promise<HashReply[]>[] = []
      // check with other nodes if they have the block hashes
      for (const client of clients) {
        if (client.getViewName() === seedStorageClient.getViewName()) continue
        blockHashesPromiseRes.push(client.push_putBlockHash(blockHashes))
      }
      // get the response and for each blockhash, check if the other nodes have the block hash
      // for the valid blockhashes, get the full block from the seed storage node
      const blockHashesRes = await PromiseUtil.allSettled(blockHashesPromiseRes)
      const validBlockHashes: string[] = []
      const invalidBlockHashes: string[] = []
      // for each of the blockhash, look for the response for other nodes
      for (let i = 0; i < blockHashes.length; i++) {
        this.log.info('Checking for blockhashes majority', { blockHash: blockHashes[i] })
        if (blockHashesRes[i].isRejected()) {
          this.log.error('Error in getting blockhashes majority', { blockHash: blockHashes[i] })
          invalidBlockHashes.push(blockHashes[i])
          continue
        }
        let hashReply = blockHashesRes[i].val
        let validCount = 0
        for (let j = 0; j < hashReply.length; j++) {
          if (hashReply[j] === 'DO_NOT_SEND') {
            validCount++
          }
        }
        // store all valid blockhashes in an array
        if (validCount >= Math.floor(clients.length / 2)) {
          validBlockHashes.push(blockHashes[i])
        } else {
          // store all invalid blockhashes in another array for logging
          invalidBlockHashes.push(blockHashes[i])
        }
      }
      this.log.info('Valid blockhashes:', validBlockHashes)
      this.log.info('Invalid blockhashes:', invalidBlockHashes)
      // read full block for all valid blockhashes from the seed storage node
      const fullBlocks = await seedStorageClient.push_getBlocksFromHashes(
        validBlockHashes,
        seedStorageClient.getViewName()
      )
      // loop through each of the blocks
      for (const block of fullBlocks) {
        this.log.info('Full block:', block)
        // parse the block and store it in the storage node
        const blockBytes = BitUtil.base16ToBytes(block)
        const parsedBlock = BlockUtil.parseBlock(blockBytes)
        const res = await Container.get(StorageNode).handleBlock(parsedBlock, blockBytes)
        if (res) {
          this.log.info('Block successfully validated')
          return true
        } else {
          this.log.error('Block validation failed')
          this.log.error('Block:', block)
          continue
        }
      }
      for (let client of clients) {
        await client.updateLastSyncedPageNumber(client.getLastSyncedPageNumber() + 1)
      }
    } catch (error) {
      this.log.error('Error in validateAndStoreBlock:', error)
      return false
    }
  }
}
