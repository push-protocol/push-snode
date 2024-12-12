// import the cpntrolers from the controllers folder

// TODO convert this to a single rpc object???

import { GetAccountInfo } from './get_accountInfo'
import { PushGetBlockHashFromView } from './push_getBlockHashFromView'
import { PushGetBlocksFromHashes } from './push_getBlocksFromHashes'
import { PushPutBlock } from './push_putBlock'
import { PushPutBlockHash } from './push_putBlockHash'
import { StorageGetShardView } from './storage_getShardView'
import { StorageGetTransaction } from './storage_getTransaction'
import { StorageGetTransactions } from './storage_getTransactions'
// put the controllers here
const controllers = {
  push_getTransactions: new StorageGetTransactions().execute,
  storage_getTransaction: new StorageGetTransaction().execute,
  push_accountInfo: new GetAccountInfo().execute,
  push_putBlockHash: new PushPutBlockHash().execute,
  push_putBlock: new PushPutBlock().execute,
  storage_getShardView: new StorageGetShardView().execute,
  push_getBlockHashFromView: new PushGetBlockHashFromView().execute,
  push_getBlocksFromHashes: new PushGetBlocksFromHashes().execute
}

export const rpcControllerConfigs = {
  controllers
}
