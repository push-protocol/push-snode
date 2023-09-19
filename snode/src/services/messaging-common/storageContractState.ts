import {Inject, Service} from "typedi";
import {Logger} from "winston";
import {WinstonUtil} from "../../utilz/winstonUtil";
import {EnvLoader} from "../../utilz/envLoader";
import {Contract, ethers, Wallet} from "ethers";
import {JsonRpcProvider} from "@ethersproject/providers/src.ts/json-rpc-provider";
import fs, {readFileSync} from "fs";
import {BitUtil} from "../../utilz/bitUtil";
import {EthersUtil} from "../../utilz/ethersUtil";
import {Coll} from "../../utilz/coll";


@Service()
export class StorageContractState {
  public log: Logger = WinstonUtil.newLog(StorageContractState);

  private listener: StorageContractListener;
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
  public rf: number;
  public shardCount: number;
  public nodeShards: Set<number>;

  public async postConstruct(listener: StorageContractListener) {
    this.log.info('postConstruct()');
    this.listener = listener;
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
    await this.readContractState();
    await this.subscribeToContractChanges(); // todo ? ethers or hardhat always emits 1 fake event
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
    this.rf = await this.storageCt.rf();
    let nodeCount = await this.storageCt.nodeCount();
    this.shardCount = await this.storageCt.SHARD_COUNT();
    this.log.info(`rf: ${this.rf} , shard count: ${this.shardCount} total nodeCount: ${nodeCount}`);
    let nodeShardmask = await this.storageCt.getNodeShardsByAddr(this.nodeWallet.address);
    // publish, new data would settle according to the new shards right away
    this.nodeShards = Coll.arrayToSet(BitUtil.bitsToPositions(nodeShardmask));
    this.log.info(`this node %s is assigned to shards (%s) : %s`,
      this.nodeWallet.address, nodeShardmask.toString(2), Coll.setToArray(this.nodeShards));
    await this.listener.handleReshard(this.nodeShards);
  }

  public async subscribeToContractChanges() {
    this.storageCt.on('SNodeMappingChanged', async (nodeList: string[]) => {
      this.log.info(`EVENT: SNodeMappingChanged: nodeList=${JSON.stringify(nodeList)}`);
      const pos = Coll.findIndex(nodeList, item => item === this.nodeAddress);
      if (pos < 0) {
        return;
      }
      let nodeShardmask = await this.storageCt.getNodeShardsByAddr(this.nodeAddress);
      const newShards = Coll.arrayToSet(BitUtil.bitsToPositions(nodeShardmask));
      // publish, new data would settle according to the new shards right away
      this.nodeShards = newShards;
      await this.listener.handleReshard(newShards);
    });
  }
}

type StorageContract = StorageContractAPI & Contract;

export interface StorageContractAPI {

  rf(): Promise<number>;

  getNodeShardsByAddr(addr: string): Promise<number>;

  nodeCount(): Promise<number>;

  SHARD_COUNT(): Promise<number>;
}

export interface StorageContractListener {
  handleReshard(nodeShards: Set<number>): Promise<void>;
}