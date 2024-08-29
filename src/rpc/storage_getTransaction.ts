import { ethers } from 'ethers'
import z from 'zod'

import { GetTransactionRequest } from '../generated/push/v1/snode_pb'
import { BitUtil } from '../utilz/bitUtil'
import { Check } from '../utilz/check'

enum Category {
  NOTIF = 0
}

const StorageGetTransactionParamsSchema = z.object({
  wallet: z.string(),
  category: z.nativeEnum(Category),
  key: z.string()
})
type StorageGetTransactionParams = z.infer<typeof StorageGetTransactionParamsSchema>

export class StorageGetTransaction {
  constructor() {}

  public static contructErrorMessage(errorMessage: string) {
    const error = new Error(errorMessage) as any
    error.data = { error: errorMessage }
    return error
  }

  public static storageGetTransactions([params], raw) {
    const bytes = BitUtil.base16ToBytes(params)
    const request = GetTransactionRequest.deserializeBinary(bytes)
    const { wallet, category, key } = request.toObject()
    this.validateGetTransaction({ wallet, category, key }, raw)
    // TODO: implement the logic
    return { wallet, category, key }
  }

  public static validateGetTransaction(params: StorageGetTransactionParams, raw) {
    // check if the wallet is in caip10 format
    const walletComponents = params.wallet.split(':')
    if (!Check.isEqual<number>(walletComponents.length, 3)) {
      const error = this.contructErrorMessage('Invalid caip format')
      throw error
    }
    if (!ethers.utils.isAddress(walletComponents[2])) {
      const error = this.contructErrorMessage('Invalid wallet address')
      throw error
    }
  }

  public static afterStorageGetTransactions = [
    (params, result, raw) => console.log('Transaction result:', result)
  ]
}
