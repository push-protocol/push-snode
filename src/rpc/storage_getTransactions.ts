import Container from 'typedi'

import { Transactions } from '../services/transactions/transactions'
import { ChainUtil } from '../utilz/chainUtil'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'

export class StorageGetTransactions extends RpcBase {
  private readonly transaction: Transactions
  private readonly log = WinstonUtil.newLog(StorageGetTransactions)
  constructor() {
    super()
    this.transaction = Container.get(Transactions)
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }

  public async execute([walletInCaip, category, timestamp, sort]: [
    string,
    string,
    string,
    string
  ]) {
    const transactions = await this.transaction.getTransactions(
      walletInCaip,
      category,
      timestamp,
      sort
    )
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
