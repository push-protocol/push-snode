// import the cpntrolers from the controllers folder

// TODO convert this to a single rpc object???

import { GetAccountInfo } from './get_accountInfo'
import { PushPutBlock } from './push_putBlock'
import { PushPutBlockHash } from './push_putBlockHash'
import { StorageGetTransaction } from './storage_getTransaction'
import { StorageGetTransactions } from './storage_getTransactions'
// put the controllers here
const controllers = {
  push_getTransactions: new StorageGetTransactions().execute,
  storage_getTransaction: new StorageGetTransaction().execute,
  push_accountInfo: new GetAccountInfo().execute,
  push_putBlockHash: new PushPutBlockHash().execute,
  push_putBlock: new PushPutBlock().execute
}

export const rpcControllerConfigs = {
  controllers
}
