import { Service } from 'typedi'
import { Logger } from 'winston'

import { PgUtil } from '../../utilz/pgUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'

type PushWalletsInput = {
  address: string
  did: string
  derivedKeyIndex: string
  encryptedDervivedPrivateKey: string
  signature: string
}

@Service()
export class PushWallets {
  constructor() {}
  public static log: Logger = WinstonUtil.newLog(PushWallets.name)
  static async addPushWallets(input: PushWalletsInput) {
    const { address, did, derivedKeyIndex, encryptedDervivedPrivateKey, signature } = input
    PushWallets.log.info('Executing push_wallets', { input })
    await PgUtil.insert(
      `INSERT INTO push_wallets (address, did, derivedkeyindex, encrypteddervivedprivatekey, signature) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (address) 
       DO UPDATE SET
       did = EXCLUDED.did,
       derivedkeyindex = EXCLUDED.derivedkeyindex,
       encrypteddervivedprivatekey = EXCLUDED.encrypteddervivedprivatekey,
       signature = EXCLUDED.signature`,
      address,
      did,
      derivedKeyIndex,
      encryptedDervivedPrivateKey,
      signature
    )
    return { success: true }
  }
}
