import Container from 'typedi'
import z from 'zod'

import { Transactions } from '../services/transactions/transactions'
import { ChainUtil } from '../utilz/chainUtil'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'

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

export class StorageGetTransactions extends RpcBase {
  private readonly transaction: Transactions
  private readonly log = WinstonUtil.newLog(StorageGetTransactions)
  constructor() {
    super()
    this.transaction = Container.get(Transactions)
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }

  public async execute(params: [string, string, string, string]) {
    const [wallet, category, timestamp, order] = params
    this.log.info('Executing get_transaction', { params })
    this.validate({
      wallet,
      category: category as Category,
      timestamp: timestamp,
      order: order as Order
    })
    const transactions = await this.transaction.getTransactions({
      namespace: category,
      timestamp,
      namespaceId: wallet,
      order: order as Order
    })
    this.log.info('Retrieved transaction successfully', { transactions })
    return transactions
  }

  public validate(params: unknown): boolean {
    try {
      // check if the wallet is in caip10 format
      const wallet = params['wallet']
      const [caip, err] = ChainUtil.parseCaipAddress(wallet)
      if (err != null) {
        throw new Error('invalid caip address:' + err)
      }
      return true
    } catch (error) {
      this.log.error('Error validating get transaction:', error)
      return false
    }
  }
}
