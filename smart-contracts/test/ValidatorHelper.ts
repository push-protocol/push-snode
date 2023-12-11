import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {verifyMessage} from "ethers/lib/utils";
import {BytesLike, DataOptions, Hexable} from "@ethersproject/bytes/src.ts";

export class EthSig2 {
  static utils = ethers.utils;

  static getMessageHashAsInContract(message: string): string {
    return ethers.utils.keccak256(ethers.utils.arrayify(message));
  }

  static toBytes(value: BytesLike | Hexable | number): Uint8Array {
    return ethers.utils.arrayify(value);
  }

  // simple sign with a private key
  static async sign(wallet: SignerWithAddress, message: string): Promise<string> {
    return await wallet.signMessage(this.toBytes(message));
  }

  // simple check signature's public key (via address)
  public static async check(message: string, sig: string, targetWallet: string): Promise<boolean> {
    const verificationAddress = verifyMessage(this.toBytes(message), sig);
    console.log('verification address:', verificationAddress);
    if (targetWallet !== verificationAddress) {
      return false;
    }
    return true;
  }

  // https://ethereum.org/es/developers/tutorials/eip-1271-smart-contract-signatures/
  static async signOffline(wallet: SignerWithAddress, message: string): Promise<string> {
    const hash = this.getMessageHashAsInContract(message);
    return await wallet.signMessage(this.toBytes(hash));
  }

  public static async checkOffline(message: string, sig: string, targetWallet: string): Promise<boolean> {
    const hash = this.getMessageHashAsInContract(message);
    const verificationAddress = verifyMessage(ethers.utils.arrayify(hash), sig);
    console.log('verification address:', verificationAddress);
    if (targetWallet !== verificationAddress) {
      return false;
    }
    return true;
  }

}

export enum NodeStatus {
  OK, // this node operates just fine (DEFAULT VALUE)
  Reported, // he have a few malicious reports
  Slashed, // we already slashed this node at least once (normally we will take -2% of collateral tokens)
  BannedAndUnstaked,   // we banned the node and unstaked it's tokens (normally we will take -10% of collateral tokens)
  Unstaked
}

export class VoteDataV {
  // the vote action, right now it is 1
  cmd: number;
  // the block where vote should be placed
  blockId: string;
  // the node wallet, we do a complaint about
  targetNode: string;


  constructor(cmd: number, blockId: string, targetNode: string) {
    this.cmd = cmd;
    this.blockId = blockId;
    this.targetNode = targetNode;
  }

  public static encode(vt: VoteDataV): string {
    let abi = ethers.utils.defaultAbiCoder;
    return abi.encode(["uint8", "uint128", "address", ],
      [1, vt.blockId, vt.targetNode]);
  }
}

export class VoteDataS {
  // the vote action, right now it is 1
  cmd: number;
  // the block where vote should be placed
  blockId: string;
  // the node wallet, we do a complaint about
  targetNode: string;
  // storage key for k-v for storage node
  skey:string;


  constructor(cmd: number, blockId: string, targetNode: string, skey:string) {
    this.cmd = cmd;
    this.blockId = blockId;
    this.targetNode = targetNode;
    this.skey = skey;
  }

  public static encode(vt: VoteDataS): string {
    let abi = ethers.utils.defaultAbiCoder;
    return abi.encode(["uint8", "uint128", "address", "uint128"],
      [2, vt.blockId, vt.targetNode, vt.skey]);
  }
}