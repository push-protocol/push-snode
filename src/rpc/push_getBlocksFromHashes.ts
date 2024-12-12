import { Block } from '../services/block/block'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'
export class PushGetBlocksFromHashes extends RpcBase {
  private readonly log = WinstonUtil.newLog(PushGetBlocksFromHashes.name)
  constructor() {
    super()
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }

  public async execute(params: { hashes: string[]; table: string }) {
    try {
      console.log('Executing push_getBlocksFromBlockHashes', { params })
      const res = await Block.getBlockInfoFromViewBasedOnBlockHashs(params.table, params.hashes)
      if (res && res.length >= 0) {
        return res
      }
    } catch (error) {
      console.log(error)
      this.log.error('Error executing push_getBlocksFromBlockHashes', { error })
      return new Error('Error executing push_getBlocksFromBlockHashes')
    }
  }

  public validate(params): boolean {
    return true
  }
}
