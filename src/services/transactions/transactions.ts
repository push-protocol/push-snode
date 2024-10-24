import { Inject, Service } from 'typedi'

import DbHelper from '../../helpers/dbHelper'
import { DateUtil } from '../../utilz/dateUtil'
// import { PgUtil } from '../../utilz/pgUtil'
import { StorageContractState } from '../messaging-common/storageContractState'

type TransactionsInput = {
  namespace: string
  timestamp: string
  namespaceId: string
  order: 'ASC' | 'DESC'
}

@Service()
export class Transactions {
  @Inject()
  private storageContractState: StorageContractState

  constructor() {}

  async getTableName(namespace: string, shardId: number, timestamp: string): Promise<string> {
    const date = DateUtil.parseUnixFloatAsDateTime(timestamp)
    // const storageTable = "storage_ns_inbox_d_202208"
    const storageTable = await DbHelper.findStorageTableByDate(namespace, shardId, date)
    return storageTable
  }

  async getTransactions(input: TransactionsInput) {
    // get the shard id
    const shardId = this.storageContractState.shardCount
    // get all transaction that are there in the table
    const inbox = await DbHelper.listInboxV2(input.namespace, shardId, input.namespaceId, '', 30)
    return { transactions: inbox }
  }

  async getTransaction(namespace: string, namespaceId: string, key: string) {
    const inbox = await DbHelper.findValueInStorageTable(key, namespace, namespaceId)
    return { transaction: [inbox] }
  }
}
