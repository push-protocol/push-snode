import { RpcUtils } from '../../utilz/rpcUtil'
import { UrlUtil } from '../../utilz/urlUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { Block } from '../block/block'

export type HashReply = 'SEND' | 'DO_NOT_SEND'

export class StorageSyncClient {
  private log = WinstonUtil.newLog(StorageSyncClient.name)
  private nodeUrl: string
  private shards: string[]
  private alreadySyncedShardIds: string[]
  private viewName: string
  private flowType: 'IN' | 'OUT'
  private lastSyncedPageNumber: number
  private currentlySyncingShard: number
  private totalCount: number
  private rpcUtil: RpcUtils
  private readonly RETIRES = 3
  private readonly RETRY_DELAY = 1000
  private readonly PAGE_SIZE = 20

  constructor(
    nodeUrl: string,
    shards: string[],
    viewName: string,
    flowType: 'IN' | 'OUT',
    lastSyncedPageNumber: number,
    totalCount: number,
    alreadySyncedShardIds: string[]
  ) {
    this.alreadySyncedShardIds = alreadySyncedShardIds
    this.nodeUrl = nodeUrl
    this.shards = shards
    this.viewName = viewName
    this.flowType = flowType
    this.lastSyncedPageNumber = lastSyncedPageNumber
    this.totalCount = totalCount
    this.rpcUtil = new RpcUtils(UrlUtil.append(nodeUrl, '/api/v1/rpc'), 'push_putBlockHash')
  }

  getViewName(): string {
    return this.viewName
  }

  getLastSyncedPageNumber(): number {
    return this.lastSyncedPageNumber
  }

  getNodeUrl(): string {
    return this.nodeUrl
  }

  getCurrentlySyncingShard(): number {
    return this.currentlySyncingShard
  }

  getAlreadySyncedShardIds(): string[] {
    return this.alreadySyncedShardIds
  }

  getAllShards(): string[] {
    return this.shards
  }

  async updateLastSyncedPageNumber(pageNumber: number) {
    this.log.debug(`Updating last synced page number to ${pageNumber}`)
    this.lastSyncedPageNumber = pageNumber
    await Block.updateInfoInStorageSyncTable(
      { viewTableName: this.viewName, flowType: this.flowType },
      { lastSyncedPageNumber: pageNumber }
    )
  }

  async updateAlreadySyncedShards(shardId: string) {
    this.log.debug(`Adding the shard ${shardId} to alreadySyncedShardIds`)
    this.alreadySyncedShardIds.push(shardId)
    await Block.updateInfoInStorageSyncTable(
      { viewTableName: this.viewName, flowType: this.flowType },
      { alreadySynedShardId: shardId }
    )
  }

  async updateCurrentlySyncingShard(currentlySyncingShard: number) {
    this.log.debug(`Updating currently syncing shard id to ${currentlySyncingShard}`)
    this.currentlySyncingShard = currentlySyncingShard
    await Block.updateInfoInStorageSyncTable(
      { viewTableName: this.viewName, flowType: this.flowType },
      { currentlySyncingShardId: currentlySyncingShard.toString() }
    )
  }

  async updateSyncStatus(syncStatus: 'SYNCING' | 'SYNCED') {
    this.log.debug(`Updating syncStatus to ${syncStatus}`)
  }

  // TODO: MOve the rpc calls to a separate class
  async push_putBlockHash(blockHash: string[]): Promise<HashReply[]> {
    this.log.debug(`Calling node ${this.nodeUrl} with blockHash: ${blockHash}`)
    if (blockHash.length == 0) return null
    const res = await this.rpcUtil.callWithRetires(
      this.RETIRES,
      this.RETRY_DELAY,
      'push_putBlockHash',
      {
        hashes: blockHash
      }
    )
    return res.data.result as HashReply[]
  }

  async push_getPaginatedBlockHashFromView(shardId: number, page: number): Promise<string[]> {
    this.log.debug(`Calling node ${this.nodeUrl} with viewName: ${this.viewName}`)
    const res = await this.rpcUtil.callWithRetires(
      this.RETIRES,
      this.RETRY_DELAY,
      'push_getBlockHashFromView',
      [this.viewName, shardId, page, this.PAGE_SIZE]
    )
    if (Array.isArray(res.data.result)) {
      return res.data.result as string[]
    } else {
      return []
    }
  }

  async push_getBlocksFromHashes(blockHashes: string[], tableName: string) {
    this.log.debug(`Calling node ${this.nodeUrl} with blockHashes: ${blockHashes}`)
    const res = await this.rpcUtil.callWithRetires(
      this.RETIRES,
      this.RETRY_DELAY,
      'push_getBlocksFromHashes',
      {
        hashes: blockHashes,
        table: tableName
      }
    )
    return res.data.result as string[]
  }
}
