import 'reflect-metadata'

import { Mutex } from 'async-mutex'
import Container, { Service } from 'typedi'

import { BitUtil } from '../../utilz/bitUtil'
import { PgUtil } from '../../utilz/pgUtil'
import { PromiseUtil } from '../../utilz/promiseUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { BlockStorage } from '../messaging/BlockStorage'
import StorageNode from '../messaging/storageNode'
import { StorageSyncClient } from '../messaging/storageSyncClient'
import { BlockUtil } from '../messaging-common/blockUtil'
import { Block } from './block'
export interface NodeSyncInfo {
  view_name: string
  flow_type: 'IN' | 'OUT'
  created_at: Date
  last_synced_page_number: string
  shard_ids: string[]
  total_count: string
  snode_url: string
  current_syncing_shard_id: string
  already_synced_shards: number[]
}

enum syncStatus {
  SYNCING = 'SYNCING',
  SYNCED = 'SYNCED'
}

enum flowType {
  IN = 'IN',
  OUT = 'OUT'
}

@Service()
export class BlockPolling {
  private static readonly FLOW_TYPE_IN = 'IN'
  private readonly log = WinstonUtil.newLog(BlockPolling.name)
  private static mutex = new Mutex()
  private storageNode: StorageNode = Container.get(StorageNode)

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
      WHERE flow_type = $1
      AND sync_status = $2;
    `
    try {
      const result = await PgUtil.queryArr<NodeSyncInfo>(
        query,
        BlockPolling.FLOW_TYPE_IN,
        syncStatus.SYNCING
      )
      this.log.info('Successfully fetched records from storage_sync_info: %o', {
        count: result.length
      })
      this.log.info(result)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log.error('Error fetching records from storage_sync_info: %s', error)
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
        alreadySyncedShards.add(shard.toString())
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

    this.log.info('Node shard map constructed successfully %o ', {
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

  public async checkAndInitiatePooling(): Promise<void> {
    // check the storage_sync_info table for the nodes that are syncing
    // if there are any, call the initiatePooling method
    try {
      const syncInfo = await Block.getViewsBasedOnSyncAndFlowStatus(syncStatus.SYNCING, flowType.IN)
      if (syncInfo.length > 0) {
        void (async () => {
          try {
            await this.initiatePooling()
          } catch (error) {
            this.log.error('Background pooling error: %s', error)
          }
        })()
      }
    } catch (error) {
      this.log.error('Error in checkAndInitiatePooling: %s', error)
    }
  }

  /**
   * Initializes the pooling mechanism
   */
  public async initiatePooling(): Promise<void> {
    return BlockPolling.mutex.runExclusive(async () => {
      try {
        if (this.nodeMap.size === 0) {
          await this.constructNodeShardMap()
        }

        for (const [shardId, clients] of this.nodeMap.entries()) {
          this.log.info('Initiating pooling for shard: %o', { shardId })

          const parsedShardId = parseInt(shardId)
          await PromiseUtil.allSettled(
            clients.map(async (client) => {
              await client.updateCurrentlySyncingShard(parsedShardId)
              await client.updateLastSyncedPageNumber(client.getLastSyncedPageNumber())
            })
          )

          for (let retryCount = 0; retryCount < 3; retryCount++) {
            try {
              const res = await this.validateAndStoreBlockHashes(parseInt(shardId), clients)
              if (res === true) {
                this.log.info(`Validation and storage successful for shard ${shardId}`)
                break
              }
              this.log.warn(`Validation failed for shard ${shardId}, retry ${retryCount + 1}/3`)

              if (retryCount < 2) {
                await new Promise((resolve) => setTimeout(resolve, 5000))
              }

              if (res === false) {
                this.log.error(
                  `Failed to validate and store block hashes for shard ${shardId} after 3 attempts. Skipping to next shard.`
                )
                continue
              }
            } catch (error) {
              this.log.error(`Error processing shard ${shardId}: %s`, error)
            }
          }
        }

        this.log.info('Pooling initiated successfully')
      } catch (error) {
        this.log.error('Error in initiatePooling: %s', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.log.error('Failed to initiate pooling: %s', { error: errorMessage })
        throw new Error(`Failed to initiate pooling: ${errorMessage}`)
      }
    })
  }

  async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 1. for each shard_id, call all the clients responsible for the shard
   * 2. for each response from the clients, check if the blockhashes are present in the db
   * 3. if the blockhashes are not present in the db, query the full block from the respective node
   * 4. parse the block and store it in the db
   */
  public async validateAndStoreBlockHashes(
    shardId: number,
    clients: StorageSyncClient[]
  ): Promise<boolean> {
    try {
      // Track pagination state for each client
      const clientPaginationState = new Map<
        StorageSyncClient,
        {
          lastSyncedPage: number
          exhausted: boolean
        }
      >(
        clients.map((client) => [
          client,
          {
            lastSyncedPage: client.getLastSyncedPageNumber(),
            exhausted: false
          }
        ])
      )

      // Create an async function to process a single client
      const processClient = async (client: StorageSyncClient): Promise<void> => {
        this.log.info(`Client ${client.getNodeUrl()} is responsible for shard ${shardId}`)

        // keep calling the client until all the block hashes are exhausted
        while (!clientPaginationState.get(client).exhausted) {
          try {
            const blockHashes = await client.push_getPaginatedBlockHashFromView(
              shardId,
              clientPaginationState.get(client).lastSyncedPage
            )

            if (blockHashes.length === 0) {
              clientPaginationState.get(client).exhausted = true
              await client.updateAlreadySyncedShards(shardId)
              await client.updateLastSyncedPageNumber(client.getLastSyncedPageNumber())
              continue
            }

            const blockHashesRes = await BlockStorage.getBulkBlockHashes(blockHashes)
            const missingBlockHashes = blockHashes.filter((hash) => !blockHashesRes.includes(hash))

            if (missingBlockHashes.length > 0) {
              const fullBlocks = await client.push_getBlocksFromHashes(
                missingBlockHashes,
                client.getViewName()
              )

              const blockProcessPromises = fullBlocks.map(async (block) => {
                try {
                  const blockBytes = BitUtil.base16ToBytes(block)
                  const parsedBlock = BlockUtil.parseBlock(blockBytes)
                  await this.storageNode.handleBlock(parsedBlock, blockBytes)
                  return true
                } catch (error) {
                  this.log.error('Error processing block: %s', error)
                  return false
                }
              })

              try {
                await PromiseUtil.allSettled(blockProcessPromises)
                await this.delay(50)
              } catch {
                this.log.error('Error in allSettled')
              }
            }
            clientPaginationState.get(client).lastSyncedPage++
            await client.updateLastSyncedPageNumber(
              clientPaginationState.get(client).lastSyncedPage
            )
          } catch (error) {
            this.log.error(`Error processing client ${client.getNodeUrl()}: %s`, error)
            break // Move to next client
          }
        }
      }

      // Process all clients in parallel
      const clientPromises = clients.map((client) => processClient(client))
      await PromiseUtil.allSettled(clientPromises)

      return true
    } catch (error) {
      this.log.error('Error in validateAndStoreBlock: %s', error)
      return false
    }
  }
}
