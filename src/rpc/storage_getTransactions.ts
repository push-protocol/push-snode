import { ethers } from 'ethers'
import Container from 'typedi'
import z from 'zod'

import { GetTransactionsRequest } from '../generated/push/v1/snode_pb'
import { Transactions } from '../services/transactions/transactions'
import { BitUtil } from '../utilz/bitUtil'
import { Check } from '../utilz/check'

enum Category {
  'INIT_DID' = 0
}

const CategoryMap = {
  0: 'INIT_DID'
}

enum Order {
  ASC = 0,
  DESC = 1
}

const OrderMap = {
  0: 'ASC',
  1: 'DESC'
}

const StorageGetTransactionsParamsSchema = z.object({
  wallet: z.string(),
  category: z.nativeEnum(Category),
  timestamp: z.string(),
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

  public static async storageGetTransactions(params: [string]) {
    const bytes = BitUtil.base16ToBytes(params[0])
    const request = GetTransactionsRequest.deserializeBinary(bytes)
    const { wallet, category, timestamp, order } = request.toObject()
    StorageGetTransactions.validateGetTransactions({
      wallet,
      category,
      timestamp: timestamp,
      order
    })
    const transaction = Container.get(Transactions)
    const orderValue = OrderMap[order] as 'ASC' | 'DESC'
    return await transaction.getTransactions({
      namespace: CategoryMap[category],
      timestamp,
      namespaceId: wallet,
      order: orderValue
    })
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
