import Container from 'typedi'
import z from 'zod'

import { Accounts } from '../services/account/accounts'
import { ChainUtil } from '../utilz/chainUtil'

const GetAccountInfoParamsSchema = z.string()
type GetAccountInfoParams = z.infer<typeof GetAccountInfoParamsSchema>
export class GetAccountInfo {
  constructor() {}

  public static contructErrorMessage(errorMessage: string) {
    const error = new Error(errorMessage) as any
    error.data = { error: errorMessage }
    return error
  }

  public static async getAccountInfo(params: [string]) {
    const [wallet] = params
    const account = Container.get(Accounts)
    return await account.getAccountInfo(wallet)
  }

  public static validateGetTransaction(wallet: GetAccountInfoParams) {
    // check if the wallet is in caip10 format
    const [caip, err] = ChainUtil.parseCaipAddress(wallet)
    if (err != null) {
      throw new Error('invalid caip address:' + err)
    }
  }

  public static afterGetAccountInfo = [
    (params, result, raw) => console.log('get_accountInfo result:', result)
  ]
}
