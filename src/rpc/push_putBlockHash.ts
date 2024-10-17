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

  public static async storageGetTransaction(params: PushPutBlockHashParams) {
    const { hashes, signature } = params
    const validationRes = PushPutBlockHash.validateGetTransaction(params)
    if (!validationRes) {
      return new Error('Invalid params')
    }
    const res = Block.getBulkBlocksByHash(hashes)
    return res
  }

  public static validateGetTransaction(params: PushPutBlockHashParams) {
    try {
      // TODO: add validation for signature
      return true
    } catch (e) {
      LoggerInstance.error('Error validating get transaction:', e)
      return false
    }
  }

  public static afterStorageGetTransaction = [
    (params, result, raw) => console.log('Block result:', result)
  ]
}
