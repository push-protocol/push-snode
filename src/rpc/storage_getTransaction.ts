import { ethers } from 'ethers'
import Container from 'typedi'
import z from 'zod'

import { Transactions } from '../services/transactions/transactions'
import { Check } from '../utilz/check'

enum Category {
  INBOX = 'INBOX',
  INIT_DID = 'INIT_DID'
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
  // TODO: Make it a util function or part of base class
  public static contructErrorMessage(errorMessage: string) {
    const error = new Error(errorMessage) as any
    error.data = { error: errorMessage }
    return error
  }

  public static async storageGetTransaction(params: [string, string, string]) {
    const [wallet, category, key] = params
    StorageGetTransaction.validateGetTransaction({
      wallet,
      category: category as Category,
      key
    })
    const transaction = Container.get(Transactions)
    return await transaction.getTransaction(category, wallet, key)
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
