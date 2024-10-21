// import the cpntrolers from the controllers folder

// TODO convert this to a single rpc object???

import { GetAccountInfo } from './get_accountInfo'
import { PushPutBlock } from './push_putBlock'
import { PushPutBlockHash } from './push_putBlockHash'
import { StorageGetTransaction } from './storage_getTransaction'
import { StorageGetTransactions } from './storage_getTransactions'
// put the controllers here
const controllers = {
  push_getTransactions: StorageGetTransactions.storageGetTransactions,
  storage_getTransaction: StorageGetTransaction.storageGetTransaction,
  push_accountInfo: GetAccountInfo.getAccountInfo,
  push_putBlockHash: PushPutBlockHash.pushPutBlockHash,
  push_putBlock: PushPutBlock.pushPutBlock
}

// put the after test controllers here, keep in mind to keep the function name same as controller
const afterController = {
  push_getTransactions: StorageGetTransactions.afterStorageGetTransactions,
  storage_getTransaction: StorageGetTransaction.afterStorageGetTransaction,
  push_accountInfo: GetAccountInfo.afterGetAccountInfo,
  push_putBlockHash: PushPutBlockHash.afterPushPutBlockHash,
  push_putBlock: PushPutBlock.afterPushPutBlock
}

export const rpcControllerConfigs = {
  controllers,
  afterController
}
