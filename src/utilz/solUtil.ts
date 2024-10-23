import nacl from "tweetnacl";
import {hashMessage} from "@ethersproject/hash";
import {Wallet} from "ethers";
import {Check} from "./check";
import {BitUtil} from "./bitUtil";
import {Keypair} from "@solana/web3.js";

export class SolUtil {

  public static signBytes(walletPrivKey: Uint8Array, msgBytes: Uint8Array): Uint8Array {
    const signature = nacl.sign.detached(msgBytes, walletPrivKey);
    Check.isTrue(signature != null && signature.length > 0);
    return signature;
  }

  public static checkSignature(walletPubKey: Uint8Array, msgBytes: Uint8Array, signature: Uint8Array): boolean {
    const result = nacl.sign.detached.verify(
      msgBytes,
      signature,
      walletPubKey,
    );
    return result;
  }

  public static convertAddrToPubKey(solAddress: string): Uint8Array {
    return BitUtil.base58ToBytes(solAddress);
  }

  public static convertPubKeyToAddr(pubKey: Uint8Array): string {
    return BitUtil.bytesToBase58(pubKey);
  }

  public static convertPrivKeyToPubKey(solanaPrivateKey: Uint8Array): Uint8Array {
    const keypair = Keypair.fromSecretKey(solanaPrivateKey);
    const pubKey = keypair.publicKey;
    return pubKey.toBytes();
  }

  public static convertPrivKeyToAddr(solanaPrivateKey: Uint8Array): string {
    const pubKey = SolUtil.convertPrivKeyToPubKey(solanaPrivateKey);
    const addrStr = SolUtil.convertPubKeyToAddr(pubKey);
    return addrStr;
  }
}