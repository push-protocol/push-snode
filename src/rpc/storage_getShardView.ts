import { Block } from '../services/block/block'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'
export class StorageGetShardView extends RpcBase {
  private readonly log = WinstonUtil.newLog(StorageGetShardView)
  constructor() {
    super()
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }

  public async execute(params: number[]) {
    try {
      this.log.info('Executing get_shard_view', { params })
      const shardSet = new Set<number>(params)
      const viewInfo = await Block.createViewOfBlocksBasedOnShardIds(shardSet)
      return viewInfo
    } catch (error) {
      this.log.error('Error executing get_shard_view', { error })
      return new Error('Error executing get_shard_view')
    }
  }

  public validate(params): boolean {
    return true
  }
}
