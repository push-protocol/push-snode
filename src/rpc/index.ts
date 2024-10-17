// import the cpntrolers from the controllers folder

import { GetAccountInfo } from './get_accountInfo'
import { StorageGetTransaction } from './storage_getTransaction'
import { StorageGetTransactions } from './storage_getTransactions'
import { PushPutBlockHash } from './push_putBlockHash'
import { PushPutBlock } from './push_putBlock'
// put the controllers here
const controllers = {
  storage_getTransactions: StorageGetTransactions.storageGetTransactions,
  storage_getTransaction: StorageGetTransaction.storageGetTransaction,
  get_accountInfo: GetAccountInfo.getAccountInfo,
  push_putBlockHash: PushPutBlockHash.pushPutBlockHash,
  push_putBlock: PushPutBlock.pushPutBlock
}

// put the after test controllers here, keep in mind to keep the function name same as controller
const afterController = {
  storage_getTransactions: StorageGetTransactions.afterStorageGetTransactions,
  storage_getTransaction: StorageGetTransaction.afterStorageGetTransaction,
  get_accountInfo: GetAccountInfo.afterGetAccountInfo,
  push_putBlockHash: PushPutBlockHash.afterPushPutBlockHash,
  push_putBlock: PushPutBlock.afterPushPutBlock
}

export const rpcControllerConfigs = {
  controllers,
  afterController
}
