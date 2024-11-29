import path from 'path'
import fs from 'fs'
import { Contract, ethers, Wallet } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers/src.ts/json-rpc-provider'
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

  public static loadAbiEx(filePath: string): string {
    const file = fs.readFileSync(filePath, 'utf8')
    const json = JSON.parse(file)
    const abi = json.abi
    console.log(`abi size:`, abi.length)
    return abi
  }

  // creates a client, using an encrypted private key from disk, so that we could sign/write to the blockchain
  public static async connectWithKey(
    privKeyDir: string,
    privKeyFileName: string,
    privKeyPass: string,
    contractAbiDir: string,
    contractAbiFileName: string,
    contractAddr: string,
    provider: JsonRpcProvider
  ): Promise<ContractWithMeta> {
    const abi = EthersUtil.loadAbi(contractAbiDir, contractAbiFileName)
    const jsonFile = fs.readFileSync(privKeyDir + '/' + privKeyFileName, 'utf-8')
    const nodeWallet = await Wallet.fromEncryptedJson(jsonFile, privKeyPass)
    const nodeAddress = await nodeWallet.getAddress()
    const signer = nodeWallet.connect(provider)
    const contract = new ethers.Contract(contractAddr, abi, signer)
    this.log.debug(
      'connecting contract %s using signer %s (keydir: %s, keyfile: %s, abi: %s) ',
      contractAddr,
      signer.address,
      privKeyDir,
      privKeyFileName,
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
    contractAbiDir: string,
    contractAbiFileName: string,
    contractAddr: string,
    provider: JsonRpcProvider
  ): Promise<Contract> {
    const abi = EthersUtil.loadAbi(contractAbiDir, contractAbiFileName)
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
