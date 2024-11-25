import { Inject, Service } from 'typedi'

import DbHelper from '../../helpers/dbHelper'
import { DateUtil } from '../../utilz/dateUtil'
// import { PgUtil } from '../../utilz/pgUtil'
import { StorageContractState } from '../messaging-common/storageContractState'

@Service()
export class Transactions {
  // the value should be the same for SNODE/ANODE
  // DON'T EDIT THIS UNLESS YOU NEED TO
  public static readonly PAGE_SIZE_FOR_ALL_NODES = 30

  @Inject()
  private storageContractState: StorageContractState

  constructor() {}

  async getTableName(namespace: string, shardId: number, timestamp: string): Promise<string> {
    const date = DateUtil.parseUnixFloatAsDateTime(timestamp)
    // const storageTable = "storage_ns_inbox_d_202208"
    const storageTable = await DbHelper.findStorageTableByDate(namespace, shardId, date)
    return storageTable
  }

  async getTransactions(walletInCaip: string, category: string, firstTs: string, sort) {
    const inbox = await DbHelper.getTransactions(
      walletInCaip,
      category,
      firstTs,
      sort,
      Transactions.PAGE_SIZE_FOR_ALL_NODES
    )
    return { transactions: inbox }
  }

  async getTransaction(namespace: string, namespaceId: string, key: string) {
    const inbox = await DbHelper.findValueInStorageTable(key, namespace, namespaceId)
    return { transaction: [inbox] }
  }
}
