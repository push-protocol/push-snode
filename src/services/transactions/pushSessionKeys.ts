import { Service } from 'typedi'

import { PgUtil } from '../../utilz/pgUtil'

type PushSessionKeysInput = {
  DID: string
  derivedKeyIndex: number
  sessionKeyPath: string
  sessionPubKey: string
}
@Service()
export class PushSessionKeys {
  constructor() {}

  async addPushSessionKeys(input: PushSessionKeysInput) {
    const { DID, derivedKeyIndex, sessionKeyPath, sessionPubKey } = input
    await PgUtil.insert(
      `INSERT INTO push_session_keys (DID, derivedKeyIndex, sessionKeyPath, sessionPubKey) VALUES ($1, $2, $3, $4)`,
      [DID, derivedKeyIndex, sessionKeyPath, sessionPubKey]
    )
    return { success: true }
  }
}
