import {ec, hash, WeierstrassSignatureType, BigNumberish} from 'starknet';
import {BitUtil} from "./bitUtil";


export class StarkNetUtil {

  public static signBytes(walletPrivKey: Uint8Array, msgBytes: Uint8Array): Uint8Array {
    const convertedMsg: BigNumberish[] = Array.from(msgBytes);
    const msgHash = hash.computeHashOnElements(convertedMsg);
    const signature: WeierstrassSignatureType = ec.starkCurve.sign(msgHash, walletPrivKey);
    return signature.toCompactRawBytes();
  }

  public static checkSignatureWithFullPublicKey(walletFullPubKey: Uint8Array, msgBytes: Uint8Array, signature: Uint8Array): boolean {
    const convertedMsg: BigNumberish[] = Array.from(msgBytes);
    const msgHash = hash.computeHashOnElements(convertedMsg);
    const result = ec.starkCurve.verify(signature, msgHash, walletFullPubKey);
    console.log('Result (boolean) =', result);
    return result;
  }

  public static checkSignature(walletAddress: Uint8Array, msgBytes: Uint8Array, signature: Uint8Array): boolean {
    const convertedMsg: BigNumberish[] = Array.from(msgBytes);
    const msgHash = hash.computeHashOnElements(convertedMsg);
    const result = ec.starkCurve.verify(signature, msgHash, walletAddress);
    console.log('Result (boolean) =', result);
    return result;
  }

  // public static isFullPubKeyRelatedToAccount() {
  //   return
  //     publicKey.publicKey == BigInt(encode.addHexPrefix(fullPublicKey.slice(4, 68)));
  // }

  public static convertPrivKeyToPubKey(walletPrivateKey: Uint8Array): Uint8Array {
    return ec.starkCurve.getPublicKey(walletPrivateKey, false);
  }

  public static convertPubKeyToAddr(pubKey: Uint8Array): string {
    return BitUtil.bytesToBase16(pubKey);
  }

  public static convertPrivKeyToAddr(starkNetPrivateKey: Uint8Array): string {
    const pubKey = StarkNetUtil.convertPrivKeyToPubKey(starkNetPrivateKey);
    const addrStr = StarkNetUtil.convertPubKeyToAddr(pubKey);
    return addrStr;
  }

  public static convertAddrToPubKey(starkNetAddress: string): Uint8Array {
    return BitUtil.base16ToBytes(starkNetAddress);
  }

}