import { ethers } from 'ethers'
import Container from 'typedi'
import z from 'zod'

import { Accounts } from '../services/account/accounts'
import { Check } from '../utilz/check'

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
    const walletComponents = wallet.split(':')
    if (!Check.isEqual<number>(walletComponents.length, 3)) {
      const error = this.contructErrorMessage('Invalid caip format')
      throw error
    }
    if (!ethers.utils.isAddress(walletComponents[2])) {
      const error = this.contructErrorMessage('Invalid wallet address')
      throw error
    }
  }

  public static afterGetAccountInfo = [
    (params, result, raw) => console.log('get_accountInfo result:', result)
  ]
}
