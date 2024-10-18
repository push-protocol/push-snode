import Container from 'typedi'
import { z } from 'zod'

import LoggerInstance from '../loaders/logger'
import StorageNode from '../services/messaging/storageNode'

const BlockItem = z.object({
  id: z.number().optional(),
  object_hash: z.string().optional(),
  object: z.string()
})
const PushPutBlockParamsSchema = z.object({
  blocks: z.array(BlockItem),
  signature: z.string()
})

type PushPutBlockParams = z.infer<typeof PushPutBlockParamsSchema>
type BlockItemType = { id?: number; object_hash?: string; object: string }
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
    const st: StorageNode = await Container.get(StorageNode)
    const result = await Promise.all(
      blocks.map(async (block) => {
        try {
          if (!block.object) {
            throw new Error('Block object is missing')
          }
          await st.accept(block as BlockItemType)
          return 'SUCCESS'
        } catch (error) {
          return { block, status: 'FAIL', error: error.message }
        }
      })
    )
    return result
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
