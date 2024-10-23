import Container from 'typedi'
import z from 'zod'

import { Transactions } from '../services/transactions/transactions'
import { ChainUtil } from '../utilz/chainUtil'

enum Category {
  'INIT_DID' = 'INIT_DID'
}

const CategoryMap = {
  0: 'INIT_DID'
}

enum Order {
  ASC = 'ASC',
  DESC = 'DESC'
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

  public static async storageGetTransactions(params: [string, string, string, string]) {
    const [wallet, category, timestamp, order] = params
    StorageGetTransactions.validateGetTransactions({
      wallet,
      category: category as Category,
      timestamp: timestamp,
      order: order as Order
    })
    const transaction = Container.get(Transactions)
    return await transaction.getTransactions({
      namespace: category,
      timestamp,
      namespaceId: wallet,
      order: order as Order
    })
  }

  public static validateGetTransactions(params: StorageGetTransactionsParams) {
    // check if the wallet is in caip10 format
    const wallet = params.wallet
    const [caip, err] = ChainUtil.parseCaipAddress(wallet)
    if (err != null) {
      throw new Error('invalid caip address:' + err)
    }
  }

  public static afterStorageGetTransactions = [
    (params, result, raw) => console.log('Transaction result:', result)
  ]
}
