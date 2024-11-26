import { Block } from '../services/block/block'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'
export class PushGetBlockHashFromView extends RpcBase {
  private readonly log = WinstonUtil.newLog(PushGetBlockHashFromView.name)
  constructor() {
    super()
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }

  public async execute(params: [string, number, number, number]) {
    try {
      console.log('Executing push_getBlockHashFromView', { params })
      // view_name, shard_id, page_number, page_size
      return await Block.getPaginatedBlockHashFromView(params[0], [params[1]], params[2], params[3])
    } catch (error) {
      console.log(error)
      this.log.error('Error executing push_getBlockHashFromView', { error })
      return new Error('Error executing push_getBlockHashFromView')
    }
  }

  public validate(params): boolean {
    return true
  }
}
