import {Service} from "typedi";
import {Logger} from "winston";
import {WinstonUtil} from "../../utilz/winstonUtil";
import {EnvLoader} from "../../utilz/envLoader";
import {Contract, ethers, Wallet} from "ethers";
import {JsonRpcProvider} from "@ethersproject/providers/src.ts/json-rpc-provider";
import path from "path";
import fs, {readFileSync} from "fs";
import {ValidatorCtClient} from "./validatorContractState";
import {BitUtil} from "../../utilz/bitUtil";
import {EthersUtil} from "../../utilz/ethersUtil";

@Service()
export class StorageContractState {
  public log: Logger = WinstonUtil.newLog(StorageContractState);
  private provider: JsonRpcProvider
  private abi: string
  private rpcEndpoint: string
  private rpcNetwork: number
  private configDir: string
  private pkFile: string;
  private pkPass: string;
  // NODE STATE
  private nodeWallet: Wallet;
  private nodeAddress: string;
  // CONTRACT STATE
  private storageCtAddr: string
  private storageCt: StorageContract;

  public async postConstruct() {
    this.log.info('postConstruct()')
    this.storageCtAddr = EnvLoader.getPropertyOrFail('STORAGE_CONTRACT_ADDRESS')
    this.rpcEndpoint = EnvLoader.getPropertyOrFail('VALIDATOR_RPC_ENDPOINT')
    this.rpcNetwork = Number.parseInt(EnvLoader.getPropertyOrFail('VALIDATOR_RPC_NETWORK'))
    this.provider = new ethers.providers.JsonRpcProvider(
      this.rpcEndpoint,
      this.rpcNetwork
    )
    this.configDir = EnvLoader.getPropertyOrFail('CONFIG_DIR')
    this.abi = EthersUtil.loadAbi(this.configDir, 'StorageV1.json')
    this.storageCt = await this.buildRWClient();
    await this.readContractState(); // todo
    await this.subscribeToContractChanges(); // todo
  }

  public async buildRWClient(): Promise<StorageContract> {
    this.pkFile = EnvLoader.getPropertyOrFail('VALIDATOR_PRIVATE_KEY_FILE')
    this.pkPass = EnvLoader.getPropertyOrFail('VALIDATOR_PRIVATE_KEY_PASS')

    const jsonFile = readFileSync(this.configDir + '/' + this.pkFile, 'utf-8')
    this.nodeWallet = await Wallet.fromEncryptedJson(jsonFile, this.pkPass)
    this.nodeAddress = await this.nodeWallet.getAddress()

    const signer = this.nodeWallet.connect(this.provider)
    const contract = <StorageContract>new ethers.Contract(this.storageCtAddr, this.abi, signer)
    return contract;
  }

  public async readContractState() {
    this.log.info(`connected to StorageContract: ${this.storageCt.address} as node ${this.nodeWallet.address}`)
    let rf = await this.storageCt.rf();
    let nodeCount = await this.storageCt.nodeCount();
    this.log.info(`rf: ${rf} , total nodeCount: ${nodeCount}`);
    let nodeShards = await this.storageCt.getNodeShardsByAddr(this.nodeWallet.address);
    const shards = BitUtil.bitsToPositions(nodeShards);
    this.log.info(`this node ${this.nodeWallet.address} is assigned to shards (${nodeShards.toString(2)}) : ${JSON.stringify(shards)}`);

  }

  public async subscribeToContractChanges() {

  }
}

type StorageContract = StorageContractAPI & Contract;

export interface StorageContractAPI {

  rf(): Promise<number>;

  getNodeShardsByAddr(addr: string): Promise<number>;

  nodeCount(): Promise<number>;
}