import { hashMessage } from '@ethersproject/hash'
import { recoverAddress } from '@ethersproject/transactions'
import { BytesLike, ethers, Wallet } from 'ethers'
import { verifyMessage } from 'ethers/lib/utils'
import { Logger } from 'winston'

import { BitUtil } from './bitUtil'
import { CaipAddr } from './chainUtil'
import { Check } from './check'
import { ObjectHasher } from './objectHasher'
import StrUtil from './strUtil'
import { WinstonUtil } from './winstonUtil'

/**
 * Utitily class that allows
 * - to sign objects with an eth private key
 * - to check that signature later
 *
 * Ignores 'signature' properties
 */
export class EthUtil {
  public static log: Logger = WinstonUtil.newLog(EthUtil)

  // sign object
  public static async create(wallet: Wallet, ...objectsToHash: any[]): Promise<string> {
    const ethMessage = ObjectHasher.hashToSha256IgnoreSig(objectsToHash)
    const sig = await wallet.signMessage(ethMessage)
    return sig
  }

  static parseCaipAddress(addressinCAIP: string): CaipAddr | null {
    if (StrUtil.isEmpty(addressinCAIP)) {
      return null
    }
    const addressComponent = addressinCAIP.split(':')
    if (addressComponent.length === 3) {
      return {
        namespace: addressComponent[0],
        chainId: addressComponent[1],
        addr: addressComponent[2]
      }
    } else if (addressComponent.length === 2) {
      return {
        namespace: addressComponent[0],
        chainId: null,
        addr: addressComponent[1]
      }
    } else {
      return null
    }
  }

  // check object
  public static check(sig: string, targetWallet: string, ...objectsToHash: any[]): boolean {
    const ethMessage = ObjectHasher.hashToSha256IgnoreSig(objectsToHash)
    const verificationAddress = verifyMessage(ethMessage, sig)
    if (targetWallet !== verificationAddress) {
      return false
    }
    return true
  }

  public static isEthZero(addr: string) {
    return '0x0000000000000000000000000000000000000000' === addr
  }

  static getMessageHashAsInContract(message: string): string {
    return ethers.utils.keccak256(ethers.utils.arrayify(message))
  }

  static toBytes(value: BytesLike | number): Uint8Array {
    return ethers.utils.arrayify(value)
  }

  // simple sign with a private key
  static async signString(wallet: ethers.Signer, message: string): Promise<string> {
    return await wallet.signMessage(this.toBytes(message))
  }

  // simple check signature's public key (via address)
  public static async checkString(
    message: string,
    sig: string,
    targetWallet: string
  ): Promise<boolean> {
    const verificationAddress = verifyMessage(this.toBytes(message), sig)
    console.log('verification address:', verificationAddress)
    if (targetWallet !== verificationAddress) {
      return false
    }
    return true
  }

  // https://ethereum.org/es/developers/tutorials/eip-1271-smart-contract-signatures/
  // sign 'message hash'
  public static async signForContract(wallet: ethers.Signer, message: string): Promise<string> {
    const hash = this.getMessageHashAsInContract(message)
    return await wallet.signMessage(this.toBytes(hash))
  }

  // check 'message hash'
  public static async checkForContract(
    message: string,
    sig: string,
    targetWallet: string
  ): Promise<boolean> {
    const hash = this.getMessageHashAsInContract(message)
    const verificationAddress = verifyMessage(ethers.utils.arrayify(hash), sig)
    console.log('verification address:', verificationAddress)
    if (targetWallet !== verificationAddress) {
      return false
    }
    return true
  }

  // 0xAAAA == eip155:1:0xAAAAA
  public static recoverAddressFromMsg(message: Uint8Array, signature: Uint8Array): string {
    return recoverAddress(hashMessage(message), signature)
  }

  public static recoverAddress(hash: Uint8Array, signature: Uint8Array): string {
    return recoverAddress(hash, signature)
  }

  public static ethHash(message: Uint8Array) {
    return hashMessage(message)
  }

  public static async signBytes(wallet: Wallet, bytes: Uint8Array): Promise<Uint8Array> {
    const sig = await wallet.signMessage(bytes)
    Check.isTrue(sig.startsWith('0x'))
    const sigNoPrefix = sig.slice(2)
    const result = BitUtil.base16ToBytes(sigNoPrefix)
    Check.isTrue(result != null && result.length > 0)
    return result
  }
}

export function Signed(target: Function) {}
