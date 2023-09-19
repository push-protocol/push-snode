import {Service} from "typedi";
import {Logger} from "winston";
import {WinstonUtil} from "../../utilz/winstonUtil";
import {EnvLoader} from "../../utilz/envLoader";
import {Contract, ethers, Wallet} from "ethers";
import {JsonRpcProvider} from "@ethersproject/providers/src.ts/json-rpc-provider";
import {readFileSync} from "fs";
import {BitUtil} from "../../utilz/bitUtil";
import {EthersUtil} from "../../utilz/ethersUtil";
import {Coll} from "../../utilz/coll";
import {Check} from "../../utilz/check";


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
  public nodeShardMap: Map<string, Set<number>> = new Map();

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
    let nodesAddrList = await this.storageCt.getNodeAddresses();
    await this.reloadEveryAddressMask(nodesAddrList);
    this.log.info(`this node %s is assigned to shards (%s) : %s`, Coll.setToArray(this.getNodeShards()));
    // publish, new data would settle according to the new shards right away
    await this.listener.handleReshard(this.getNodeShards(), this.nodeShardMap);
  }

  public async subscribeToContractChanges() {
    this.storageCt.on('SNodeMappingChanged', async (nodeList: string[]) => {
      this.log.info(`EVENT: SNodeMappingChanged: nodeList=${JSON.stringify(nodeList)}`);
      await this.reloadEveryAddressMask(nodeList);
      await this.listener.handleReshard(this.getNodeShards(), this.nodeShardMap);
    });
  }

  // todo we can add 1 contract call for all addrs
  async reloadEveryAddressMask(nodeAddrList: string[]): Promise<void> {
    for (const nodeAddr of nodeAddrList) {
      let nodeShardmask = await this.storageCt.getNodeShardsByAddr(nodeAddr);
      const shardSet = Coll.arrayToSet(BitUtil.bitsToPositions(nodeShardmask));
      this.nodeShardMap.set(nodeAddr, shardSet);
      this.log.info(`node %s is re-assigned to shards (%s) : %s`,
        nodeAddr, nodeShardmask.toString(2), Coll.setToArray(shardSet));
    }
  }

  // fails if this.nodeAddress is not defined
  public getNodeShards(): Set<number> {
    Check.notEmpty(this.nodeAddress);
    const nodeShards = this.nodeShardMap.get(this.nodeAddress);
    Check.notEmptySet(nodeShards);
    return nodeShards;
  }
}

type StorageContract = StorageContractAPI & Contract;

export interface StorageContractAPI {

  rf(): Promise<number>;

  getNodeAddresses(): Promise<string[]>;

  getNodeShardsByAddr(addr: string): Promise<number>;

  nodeCount(): Promise<number>;

  SHARD_COUNT(): Promise<number>;
}

export interface StorageContractListener {
  handleReshard(currentNodeShards: Set<number>|null, allNodeShards: Map<string, Set<number>>): Promise<void>;
}