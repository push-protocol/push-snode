import { JsonRpcProvider } from '@ethersproject/providers/src.ts/json-rpc-provider'
import { Contract, ethers, Wallet } from 'ethers'
import fs from 'fs'
import path from 'path'

import { WinstonUtil } from './winstonUtil'

export class EthersUtil {
  static log = WinstonUtil.newLog(EthersUtil)

  public static loadAbi(configDir: string, fileNameInConfigDir: string): string {
    const fileAbsolute = path.resolve(configDir, `./${fileNameInConfigDir}`)
    const file = fs.readFileSync(fileAbsolute, 'utf8')
    const json = JSON.parse(file)
    const abi = json.abi
    console.log(`abi size:`, abi.length)
    return abi
  }

  // creates a client, using an encrypted private key from disk, so that we could sign/write to the blockchain
  public static async connectWithKey(
    configDir: string,
    privateKeyFileName: string,
    privateKeyPass: string,
    contractAbiFileName: string,
    contractAddr: string,
    provider: JsonRpcProvider
  ): Promise<ContractWithMeta> {
    const abi = EthersUtil.loadAbi(configDir, contractAbiFileName)
    const jsonFile = fs.readFileSync(configDir + '/' + privateKeyFileName, 'utf-8')
    const nodeWallet = await Wallet.fromEncryptedJson(jsonFile, privateKeyPass)
    const nodeAddress = await nodeWallet.getAddress()
    const signer = nodeWallet.connect(provider)
    const contract = new ethers.Contract(contractAddr, abi, signer)
    this.log.debug(
      'connecting contract %s using signer %s (keydir: %s, keyfile: %s, abi: %s) ',
      contractAddr,
      signer.address,
      configDir,
      privateKeyFileName,
      contractAbiFileName
    )
    return {
      contract,
      nodeWallet,
      nodeAddress
    }
  }

  // creates a client which can only read blockchain state
  public static async connectWithoutKey(
    configDir: string,
    contractAbiFileName: string,
    contractAddr: string,
    provider: JsonRpcProvider
  ): Promise<Contract> {
    const abi = EthersUtil.loadAbi(configDir, contractAbiFileName)
    const contract = new ethers.Contract(contractAddr, abi, provider)
    this.log.debug('connecting contract %s (no key, abi: %s) ', contractAddr, contractAbiFileName)
    return contract
  }
}

type ContractWithMeta = {
  contract: Contract
  nodeWallet: Wallet
  nodeAddress: string
}
