import {BytesLike, ethers, Wallet} from 'ethers'
import {verifyMessage} from 'ethers/lib/utils'
import {ObjectHasher} from './objectHasher'
import {recoverAddress,computeAddress} from "@ethersproject/transactions";
import {hashMessage} from "@ethersproject/hash";
import {BitUtil} from "./bitUtil";
import {Check} from "./check";
import {Logger} from "winston";
import {WinstonUtil} from "./winstonUtil";
import {secp256k1} from "ethereum-cryptography/secp256k1";
import {keccak256} from "ethereum-cryptography/keccak";

export class EthUtil {
  public static log: Logger = WinstonUtil.newLog(EthUtil);

  // sign json object
  // @deprecated
  public static async create(wallet: Wallet, ...objectsToHash: any[]): Promise<string> {
    const ethMessage = ObjectHasher.hashToSha256IgnoreSig(objectsToHash)
    const sig = await wallet.signMessage(ethMessage)
    return sig
  }

  // check json object
  // @deprecated
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


  public static recoverAddressFromMsg(message: Uint8Array, signature: Uint8Array): string {
    return recoverAddress(hashMessage(message), signature)
  }

  public static recoverAddressFromHash(hash: Uint8Array, signature: Uint8Array): string {
    return recoverAddress(hash, signature)
  }

  public static ethHash(message: Uint8Array) {
    return hashMessage(message);
  }

  public static async signBytes(wallet: Wallet, bytes: Uint8Array): Promise<Uint8Array> {
    const sig = await wallet.signMessage(bytes);
    Check.isTrue(sig.startsWith('0x'));
    let sigNoPrefix = sig.slice(2);
    let result = BitUtil.base16ToBytes(sigNoPrefix);
    Check.isTrue(result != null && result.length > 0);
    return result;
  }

  public static convertPrivKeyToPubKey(privKey: Uint8Array, compressed: boolean = true): Uint8Array {
    return secp256k1.getPublicKey(privKey, compressed);
  }


  public static convertPrivKeyToAddr(privKey: Uint8Array): string {
    let pubKeyUncomp = this.convertPrivKeyToPubKey(privKey, false);
    return this.convertPubKeyToAddr(pubKeyUncomp);
  }

  // first naive version
  public static convertPubKeyToAddrOld(publicKeyUncompressed: Uint8Array): string {
    const address = keccak256(publicKeyUncompressed.slice(1)).slice(-20);
    return BitUtil.bytesToBase16(address);
  }


  public static convertPubKeyToAddr(publicKeyUncompressed: Uint8Array): string {
    const address1 = computeAddress(publicKeyUncompressed);
    return BitUtil.hex0xRemove(address1);
  }
}
