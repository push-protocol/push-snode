import { Service } from 'typedi'
import { Logger } from 'winston'

import { PgUtil } from '../../utilz/pgUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'

type PushKeysInput = {
  masterPublicKey: string
  did: string
  derivedKeyIndex: number
  derivedPublicKey: string
}

@Service()
export class PushKeys {
  constructor() {}
  public static log: Logger = WinstonUtil.newLog(PushKeys.name)
  static async addPushKeys(input: PushKeysInput): Promise<{ success: boolean }> {
    try {
      const query = `
        INSERT INTO push_keys (masterpublickey, did, derivedkeyindex, derivedpublickey)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (did) 
        DO UPDATE SET 
          derivedkeyindex = EXCLUDED.derivedkeyindex,
          derivedpublickey = EXCLUDED.derivedpublickey
      `

      await PgUtil.insert(
        query,
        input.masterPublicKey,
        input.did,
        input.derivedKeyIndex,
        input.derivedPublicKey
      )

      return { success: true }
    } catch (error) {
      console.error('Error inserting or updating push keys:', error)
      return { success: false }
    }
  }

  static async getPushKeysViaMasterKey(masterPublicKey: string) {
    const query = `SELECT * FROM push_keys WHERE masterpublickey = $1`
    const result = await PgUtil.queryOneRow(query, [masterPublicKey])
    return { result }
  }

  static async getPushKeysViaDerivedKey(derivedPublicKey: string) {
    const query = `SELECT * FROM push_keys WHERE derivedpublickey = $1`
    const result = await PgUtil.queryOneRow(query, [derivedPublicKey])
    return { result }
  }
}
