import Container from 'typedi'
import { z } from 'zod'

import LoggerInstance from '../loaders/logger'
import StorageNode from '../services/messaging/storageNode'
import { BlockUtil } from '../services/messaging-common/blockUtil'
import { BitUtil } from '../utilz/bitUtil'
import { StrUtil } from '../utilz/strUtil'

const BlockItem = z.object({
  id: z.number().optional(),
  object_hash: z.string().optional(),
  object: z.string()
})
const PushPutBlockParamsSchema = z.object({
  blocks: z.array(z.string()),
  signature: z.string()
})

type PushPutBlockParams = z.infer<typeof PushPutBlockParamsSchema>
type BlockItemType = { id?: number; object_hash?: string; object: string }
type BlockResult = { status: 'ACCEPTED' | 'REJECTED'; reason?: string }

export class PushPutBlock {
  constructor() {}

  public static contructErrorMessage(errorMessage: string) {
    const error = new Error(errorMessage) as any
    error.data = { error: errorMessage }
    return error
  }

  public static async pushPutBlock(params: PushPutBlockParams) {
    const { blocks, signature } = params

    // Validate the transaction parameters
    const validationRes = PushPutBlock.validatePushPutBlock(params)
    if (!validationRes) {
      return new Error('Invalid params')
    }

    const result: BlockResult[] = []
    for (let i = 0; i < blocks.length; i++) {
      let br = await PushPutBlock.handleOneBlock(blocks[i])
      result.push(br)
    }
    return result
  }

  private static async handleOneBlock(blockBase16: string): Promise<BlockResult> {
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

  public static validatePushPutBlock(params: PushPutBlockParams) {
    try {
      // TODO: add validation for signature
      return true
    } catch (e) {
      LoggerInstance.error('Error validating get transaction:', e)
      return false
    }
  }

  public static afterPushPutBlock = [(params, result, raw) => console.log('Block result:', result)]
}
