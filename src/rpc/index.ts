// import the cpntrolers from the controllers folder

import { GetAccountInfo } from './get_accountInfo'
import { StorageGetTransaction } from './storage_getTransaction'
import { StorageGetTransactions } from './storage_getTransactions'
// put the controllers here
const controllers = {
  storage_getTransactions: StorageGetTransactions.storageGetTransactions,
  storage_getTransaction: StorageGetTransaction.storageGetTransaction,
  get_accountInfo: GetAccountInfo.getAccountInfo
}

// put the after test controllers here, keep in mind to keep the function name same as controller
const afterController = {
  storage_getTransactions: StorageGetTransactions.afterStorageGetTransactions,
  storage_getTransaction: StorageGetTransaction.afterStorageGetTransaction,
  get_accountInfo: GetAccountInfo.afterGetAccountInfo
}

export const rpcControllerConfigs = {
  controllers,
  afterController
}
