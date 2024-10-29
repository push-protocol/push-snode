import { z } from 'zod'

import { Block } from '../services/block/block'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'

const PushPutBlockHashParamsSchema = z.object({
  hashes: z.array(z.string()),
  signature: z.string()
})

type PushPutBlockHashParams = z.infer<typeof PushPutBlockHashParamsSchema>

export class PushPutBlockHash extends RpcBase {
  constructor() {
    super()
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }
  private readonly log = WinstonUtil.newLog(PushPutBlockHash.name)

  public async execute(params: PushPutBlockHashParams) {
    const { hashes, signature } = params
    this.log.info('Executing push_putBlockHash', { params })
    const validationRes = this.validate(params)
    if (!validationRes) {
      return this.constructErrorMessage('Invalid params')
    }
    const statusArray = await Block.getBulkBlocksByHash(hashes)
    this.log.info('Retrieved block hashes successfully', { statusArray })
    return statusArray
  }

  public validate(params: PushPutBlockHashParams): boolean {
    try {
      return true
    } catch (e) {
      this.log.error('Error validating get transaction:', e)
      return false
    }
  }
}
