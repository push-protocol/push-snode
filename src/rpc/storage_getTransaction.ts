import Container from 'typedi'
import z from 'zod'

import { Transactions } from '../services/transactions/transactions'
import { ChainUtil } from '../utilz/chainUtil'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'

enum Category {
  INBOX = 'INBOX',
  INIT_DID = 'INIT_DID'
}

const StorageGetTransactionsParamsSchema = z.object({
  wallet: z.string(),
  category: z.nativeEnum(Category),
  key: z.string()
})
type StorageGetTransactionsParams = z.infer<typeof StorageGetTransactionsParamsSchema>

export class StorageGetTransaction extends RpcBase {
  private readonly log = WinstonUtil.newLog(StorageGetTransaction)
  private readonly transaction: Transactions
  constructor() {
    super()
    this.transaction = Container.get(Transactions)
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }

  public async execute(params: [string, string, string]) {
    const [wallet, category, key] = params
    this.log.info('Executing get_transaction', { params })
    this.validate({
      wallet,
      category: category as Category,
      key
    })
    const transaction = this.transaction.getTransaction(category as Category, wallet, key)
    this.log.info('Retrieved transaction successfully', { transaction })
    return transaction
  }

  public validate(params: StorageGetTransactionsParams): boolean {
    try {
      // check if the wallet is in caip10 format
      const wallet = params.wallet
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
