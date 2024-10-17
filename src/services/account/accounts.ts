import { Service } from 'typedi'

import DbHelper from '../../helpers/dbHelper'

@Service()
export class Accounts {
  constructor() {}

  async getAccountInfo(wallet: string) {
    const accountInfo = await DbHelper.getAccountInfo(wallet)
    return { pushKeys: accountInfo }
  }
}
