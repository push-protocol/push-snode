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
       ON CONFLICT DO NOTHING`,
      address,
      did,
      derivedKeyIndex,
      encryptedDervivedPrivateKey,
      signature
    )
    return { success: true }
  }
}
