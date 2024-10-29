import { Service } from 'typedi'

import { PgUtil } from '../../utilz/pgUtil'

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

  static async addPushWallets(input: PushWalletsInput) {
    const { address, did, derivedKeyIndex, encryptedDervivedPrivateKey, signature } = input
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
