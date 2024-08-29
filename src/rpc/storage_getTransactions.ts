import { ethers } from 'ethers'
import z from 'zod'

import { GetTransactionsRequest } from '../generated/push/v1/snode_pb'
import { BitUtil } from '../utilz/bitUtil'
import { Check } from '../utilz/check'

enum Category {
  NOTIF = 0
}

enum Order {
  ASC = 0,
  DESC = 1
}
const StorageGetTransactionsParamsSchema = z.object({
  wallet: z.string(),
  category: z.nativeEnum(Category),
  sortKey: z.string(),
  order: z.nativeEnum(Order)
})
type StorageGetTransactionsParams = z.infer<typeof StorageGetTransactionsParamsSchema>

export class StorageGetTransactions {
  constructor() {}

  public static contructErrorMessage(errorMessage: string) {
    const error = new Error(errorMessage) as any
    error.data = { error: errorMessage }
    return error
  }

  public static storageGetTransactions(params: string) {
    const bytes = BitUtil.base64ToBytes(params)
    const request = GetTransactionsRequest.deserializeBinary(bytes)
    const { wallet, category, sortkey, order } = request.toObject()
    StorageGetTransactions.validateGetTransactions({ wallet, category, sortKey: sortkey, order })
    // TODO: implement the logic
    return { wallet, category, sortkey, order }
  }

  public static validateGetTransactions(params: StorageGetTransactionsParams) {
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
