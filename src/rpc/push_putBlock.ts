import Container from 'typedi'
import { z } from 'zod'

import StorageNode from '../services/messaging/storageNode'
import { BlockUtil } from '../services/messaging-common/blockUtil'
import { BitUtil } from '../utilz/bitUtil'
import { StrUtil } from '../utilz/strUtil'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'

const PushPutBlockParamsSchema = z.object({
  blocks: z.array(z.string()),
  signature: z.string()
})

type PushPutBlockParams = z.infer<typeof PushPutBlockParamsSchema>
type BlockResult = { status: 'ACCEPTED' | 'REJECTED'; reason?: string }

export class PushPutBlock extends RpcBase {
  constructor() {
    super()
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }
  private readonly log = WinstonUtil.newLog(PushPutBlock.name)

  async execute(params: PushPutBlockParams) {
    const { blocks, signature } = params
    // Validate the transaction parameters
    const validationRes = this.validate(params)
    if (!validationRes) {
      return new Error('Invalid params')
    }

    const result: BlockResult[] = []
    for (let i = 0; i < blocks.length; i++) {
      let br = await this.handleOneBlock(blocks[i])
      result.push(br)
    }
    return result
  }

  private async handleOneBlock(blockBase16: string): Promise<BlockResult> {
    if (StrUtil.isEmpty(blockBase16)) {
      return { status: 'REJECTED', reason: 'empty block data' }
    }
    blockBase16 = BitUtil.hex0xRemove(blockBase16).toLowerCase()
    try {
      const blockBytes = BitUtil.base16ToBytes(blockBase16)
      const block = BlockUtil.parseBlock(blockBytes)
      const storageNode: StorageNode = Container.get(StorageNode) // todo @Inject via container
      let res = await storageNode.handleBlock(block, blockBytes)
      if (res == true) {
        return { status: 'ACCEPTED' }
      } else {
        return { status: 'REJECTED', reason: 'duplicate' }
      }
    } catch (error) {
      return { status: 'REJECTED', reason: error.message }
    }
  }

  validate(params: PushPutBlockParams): boolean {
    try {
      // TODO: add validation for signature
      return true
    } catch (e) {
      this.log.error('Error validating get transaction:', e)
      return false
    }
  }
}
