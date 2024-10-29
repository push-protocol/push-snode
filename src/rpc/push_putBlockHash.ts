import { z } from 'zod'

import LoggerInstance from '../loaders/logger'
import { Block } from '../services/block/block'

const PushPutBlockHashParamsSchema = z.object({
  hashes: z.array(z.string()),
  signature: z.string()
})

type PushPutBlockHashParams = z.infer<typeof PushPutBlockHashParamsSchema>
export class PushPutBlockHash {
  constructor() {}

  public static contructErrorMessage(errorMessage: string) {
    const error = new Error(errorMessage) as any
    error.data = { error: errorMessage }
    return error
  }

  public static async pushPutBlockHash(params: PushPutBlockHashParams) {
    const { hashes, signature } = params
    const validationRes = PushPutBlockHash.validatePushPutBlockHash(params)
    if (!validationRes) {
      return new Error('Invalid params')
    }
    const statusArray = await Block.getBulkBlocksByHash(hashes)
    return { result: statusArray }
  }

  public static validatePushPutBlockHash(params: PushPutBlockHashParams) {
    try {
      // TODO: add validation for signature
      return true
    } catch (e) {
      LoggerInstance.error('Error validating get transaction:', e)
      return false
    }
  }

  public static afterPushPutBlockHash = [
    (params, result, raw) => console.log('Block result:', result)
  ]
}
