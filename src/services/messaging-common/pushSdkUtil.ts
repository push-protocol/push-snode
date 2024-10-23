import {ethers} from "ethers";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {sha256} from '@noble/hashes/sha256';
import util from "util";
import {getAddress, verifyMessage} from "ethers/lib/utils";
import {computeAddress} from "@ethersproject/transactions";
import { bech32m } from 'bech32';

const hexes = /*#__PURE__*/ Array.from({length: 256}, (_v, i) =>
  i.toString(16).padStart(2, '0'),
)

/*
A utility SDK class which is shared between back and front.
Provides signature validation logic which should be in sync.

Rules:
1. Don't use any utility classes
2. Only public libs which work in the browser
3. NO BACKEND DEPENDENCIES: THIS IS FRONT END LIB

*/
export class PushSdkUtil {


  public static async checkPushInitDidSignature(masterPublicKeyUncompressed: Uint8Array, msgBytes: Uint8Array,
                                                sig: Uint8Array): Promise<SigCheck> {
    const masterAddrStr = computeAddress(masterPublicKeyUncompressed).toLowerCase();
    let hashBytes = this.messageBytesToHashBytes(msgBytes);
    let recoverAddrStr = verifyMessage(hashBytes, sig).toLowerCase();
    if (recoverAddrStr !== masterAddrStr) {
      return SigCheck.failWithText(`masterPublicKey address ${masterAddrStr} differs from signature addr ${recoverAddrStr}`);
    }
    return SigCheck.ok();
  }

  public static async checkPushNetworkSignature(caipNamespace: string, caipChainId: string, caipAddr: string,
                                                msgBytes: Uint8Array, sig: Uint8Array): Promise<SigCheck> {
    let hashBytes = this.messageBytesToHashBytes(msgBytes);
    if (caipNamespace === 'push') {
      // PUSH NETWORK SIGNATURES
      const evmAddr = this.pushAddrToEvmAddr(caipAddr);
      const recoveredAddr = ethers.utils.recoverAddress(ethers.utils.hashMessage(hashBytes), sig);
      const valid = recoveredAddr?.toLowerCase() === evmAddr?.toLowerCase();
      if (!valid) {
        return SigCheck.failWithText(`sender address ${caipAddr} does not match recovered address ${recoveredAddr} signature was: ${sig}`);
      }
      return SigCheck.ok();
    } else if (caipNamespace === 'eip155') {
      // EVM SIGNATURES
      const recoveredAddr = ethers.utils.recoverAddress(ethers.utils.hashMessage(hashBytes), sig);
      const valid = recoveredAddr === caipAddr;
      if (!valid) {
        return SigCheck.failWithText(`sender address ${caipAddr} does not match recovered address ${recoveredAddr} signature was: ${sig}`);
      }
      return SigCheck.ok();
    } else if (caipNamespace === 'solana') {
      // SOLANA SIGNATURES
      const expectedPubKey = bs58.decode(caipAddr);
      const valid = nacl.sign.detached.verify(hashBytes, sig, expectedPubKey);
      if (!valid) {
        return SigCheck.failWithText(`sender address ${caipAddr} does not match with signature: ${sig}`);
      }
      return SigCheck.ok();
    } else {
      return SigCheck.failWithText(`unsupported chain id: ${caipNamespace}`);
    }
  }

  /**
   * Converts a Push (bech32m) address to an EVM address
   * @param address Push address,
   * ex: pushconsumer1ulpxwud78ctaar5zgeuhmju5k8gpz8najcvxkn
   * @returns EVM address in checksum format,
   * ex: 0xE7C26771bE3E17dE8e8246797DCB94b1D0111E7D
   */
  public static pushAddrToEvmAddr(address: string): string {
    const decoded = bech32m.decode(address);
    const bytes = new Uint8Array(bech32m.fromWords(decoded.words));
    const result = getAddress(this.toHex(bytes));
    return result;
  };


  /**
   * For some web3 wallet compatibility we cannot sign
   * 1. raw bytes - Phantom tries to decode this (https://docs.phantom.app/solana/signing-a-message)
   * 2. base16 text - Metamask adds 0x prefix
   * 3. long base16 text - this breaks UX
   *
   * So the only good option to sign is to use
   * 1. short
   * 2. 0x prefixed
   * 3. string
   * 4. in utf8 bytes
   *
   * so we try to convert this payload into a 0xSHA bytes first
   * @param payload
   */
  public static messageBytesToHashBytes(payload: Uint8Array): Uint8Array {
    let txSha = sha256(payload); // raw bytes (non ascii)
    let hexedSha = this.toHex(txSha);
    const textShaInBytesUtf8 = new util.TextEncoder().encode(hexedSha); // utf-8
    return textShaInBytesUtf8;
  }

  public static toHex(value: Uint8Array): string {
    let string = ''
    for (let i = 0; i < value.length; i++) {
      string += hexes[value[i]]
    }
    const hex = `0x${string}` as const
    return hex
  }

  public static hex0xRemove(hexString: string) {
    if (hexString.length >= 2 && (hexString.startsWith('0x') || hexString.startsWith('0X'))) {
      hexString = hexString.substring(2);
    }
    if (hexString.length % 2 == 1) {
      hexString = '0' + hexString;
    }
    return hexString.toLowerCase();
  }
}

export class SigCheck {
  success: boolean
  err: string

  static failWithText(err: string): SigCheck {
    return {success: false, err: err}
  }

  static ok(): SigCheck {
    return {success: true, err: ''}
  }
}