import { ethers } from 'ethers'
import Container from 'typedi'
import z from 'zod'

import { GetTransactionRequest } from '../generated/push/v1/snode_pb'
import { Transactions } from '../services/transactions/transactions'
import { BitUtil } from '../utilz/bitUtil'
import { Check } from '../utilz/check'

enum Category {
  INBOX = 0
}

const CategoryMap = {
  0: 'inbox'
}

const StorageGetTransactionsParamsSchema = z.object({
  wallet: z.string(),
  category: z.nativeEnum(Category),
  key: z.string()
})
type StorageGetTransactionsParams = z.infer<typeof StorageGetTransactionsParamsSchema>

export class StorageGetTransaction {
  constructor() {}

  public static contructErrorMessage(errorMessage: string) {
    const error = new Error(errorMessage) as any
    error.data = { error: errorMessage }
    return error
  }

  public static async storageGetTransaction(params: [string]) {
    const bytes = BitUtil.base16ToBytes(params[0])
    const request = GetTransactionRequest.deserializeBinary(bytes)
    const { wallet, category, key } = request.toObject()
    StorageGetTransaction.validateGetTransaction({
      wallet,
      category,
      key
    })
    const transaction = Container.get(Transactions)
    return await transaction.getTransaction(CategoryMap[category], wallet, key)
  }

  public static validateGetTransaction(params: StorageGetTransactionsParams) {
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

  public static afterStorageGetTransaction = [
    (params, result, raw) => console.log('Transaction result:', result)
  ]
}
