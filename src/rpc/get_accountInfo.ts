import Container from 'typedi'
import z from 'zod'

import { Accounts } from '../services/account/accounts'
import { ChainUtil } from '../utilz/chainUtil'
import { WinstonUtil } from '../utilz/winstonUtil'
import { RpcBase } from './RpcBase'

const GetAccountInfoParamsSchema = z.string()
type GetAccountInfoParams = z.infer<typeof GetAccountInfoParamsSchema>

export class GetAccountInfo extends RpcBase {
  private readonly log = WinstonUtil.newLog(GetAccountInfo)
  private readonly accounts: Accounts

  constructor() {
    super()
    this.accounts = Container.get(Accounts)
    this.execute = this.execute.bind(this)
    this.validate = this.validate.bind(this)
  }

  public async execute(params: GetAccountInfoParams) {
    try {
      this.log.info('Executing get_accountInfo', { params })

      // Validate parameters before proceeding
      this.validate(params)

      const [wallet] = params
      const accountInfo = await this.accounts.getAccountInfo(wallet)

      this.log.info('Retrieved account info successfully', { accountInfo })
      return accountInfo
    } catch (error) {
      this.log.error('Failed to get account info', { error, params })
      throw this.constructErrorMessage(
        error instanceof Error ? error.message : 'Unknown error occurred'
      )
    }
  }

  public validate(params: GetAccountInfoParams): boolean {
    try {
      // Validate params against schema
      GetAccountInfoParamsSchema.parse(params)

      const [wallet] = params
      const [caip, err] = ChainUtil.parseCaipAddress(wallet)

      if (err != null) {
        throw new Error(`Invalid CAIP address: ${err}`)
      }

      return true
    } catch (error) {
      this.log.error('Validation failed', { error, params })
      return false
    }
  }
}
