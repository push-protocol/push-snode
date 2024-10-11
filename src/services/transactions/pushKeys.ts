import { Service } from 'typedi'

import { PgUtil } from '../../utilz/pgUtil'

type PushKeysInput = {
  masterPublicKey: string
  did: string
  derivedKeyIndex: number
  derivedPublicKey: string
}

@Service()
export class PushKeys {
  constructor() {}

  static async addPushKeys(input: PushKeysInput): Promise<{ success: boolean }> {
    try {
      const query = `
        INSERT INTO push_keys (masterpublickey, did, derivedkeyindex, derivedpublickey)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `

      const res = await PgUtil.insert(
        query,
        input.masterPublicKey,
        input.did,
        input.derivedKeyIndex,
        input.derivedPublicKey
      )

      return { success: true }
    } catch (error) {
      console.error('Error inserting push keys:', error)
      return { success: false }
    }
  }

  static async getPushKeysViaMasterKey(masterPublicKey: string) {
    const query = `SELECT * FROM push_keys WHERE master_public_key = $1`
    const result = await PgUtil.queryOneRow(query, [masterPublicKey])
    return { result: result }
  }

  static async getPushKeysViaDerivedKey(derivedPublicKey: string) {
    const query = `SELECT * FROM push_keys WHERE derived_public_key = $1`
    const result = await PgUtil.queryOneRow(query, [derivedPublicKey])
    return { result: result }
  }
}
