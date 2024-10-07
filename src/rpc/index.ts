// import the cpntrolers from the controllers folder
import { StorageGetTransaction } from './storage_getTransaction'
import { StorageGetTransactions } from './storage_getTransactions'
// put the controllers here
const controllers = {
  storage_getTransactions: StorageGetTransactions.storageGetTransactions,
  storage_getTransaction: StorageGetTransaction.storageGetTransaction
}

// put the after test controllers here, keep in mind to keep the function name same as controller
const afterController = {
  storage_getTransactions: StorageGetTransactions.afterStorageGetTransactions,
  storage_getTransaction: StorageGetTransaction.afterStorageGetTransaction
}

export const rpcControllerConfigs = {
  controllers,
  afterController
}
