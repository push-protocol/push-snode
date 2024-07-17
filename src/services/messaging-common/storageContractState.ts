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
  private rpcEndpoint: string
  private rpcNetwork: number
  private useSigner: boolean;
  // NODE STATE
  private nodeWallet: Wallet | null;
  private nodeAddress: string | null;
  // CONTRACT STATE
  private storageCtAddr: string
  private storageCt: StorageContract;
  public rf: number;
  public shardCount: number;
  // node0xA -> shard0, shard1, shard2
  public nodeShardMap: Map<string, Set<number>> = new Map();
  // VARS
  // shard0 -> node0xA, node0xB
  public shardToNodesMap: Map<number, Set<string>> = new Map();

  public async postConstruct(useSigner: boolean, listener: StorageContractListener) {
    this.log.info('postConstruct()');
    this.listener = listener;
    this.storageCtAddr = EnvLoader.getPropertyOrFail('STORAGE_CONTRACT_ADDRESS')
    this.rpcEndpoint = EnvLoader.getPropertyOrFail('VALIDATOR_RPC_ENDPOINT')
    this.rpcNetwork = Number.parseInt(EnvLoader.getPropertyOrFail('VALIDATOR_RPC_NETWORK'))
    this.provider = new ethers.providers.JsonRpcProvider(
      this.rpcEndpoint,
      this.rpcNetwork
    )
    this.useSigner = useSigner;
    if (useSigner) {
      let connect = await EthersUtil.connectWithKey(
        EnvLoader.getPropertyOrFail('CONFIG_DIR'),
        EnvLoader.getPropertyOrFail('VALIDATOR_PRIVATE_KEY_FILE'),
        EnvLoader.getPropertyOrFail('VALIDATOR_PRIVATE_KEY_PASS'),
        'StorageV1.json',
        EnvLoader.getPropertyOrFail('STORAGE_CONTRACT_ADDRESS'),
        this.provider
      );
      this.storageCt = <StorageContract>connect.contract;
      this.nodeWallet = connect.nodeWallet;
      this.nodeAddress = connect.nodeAddress;
    } else {
      this.storageCt = <StorageContract>await EthersUtil.connectWithoutKey(
        EnvLoader.getPropertyOrFail('CONFIG_DIR'),
        'StorageV1.json',
        EnvLoader.getPropertyOrFail('STORAGE_CONTRACT_ADDRESS'),
        this.provider
      )
    }
    await this.readContractState();
    await this.subscribeToContractChanges(); // todo ? ethers or hardhat always emits 1 fake event
  }

  public async readContractState() {
    this.log.info(`connected to StorageContract`)
    this.rf = await this.storageCt.rf();
    let nodeCount = await this.storageCt.nodeCount();
    this.shardCount = await this.storageCt.SHARD_COUNT();
    this.log.info(`rf: ${this.rf} , shard count: ${this.shardCount} total nodeCount: ${nodeCount}`);
    let nodesAddrList = await this.storageCt.getNodeAddresses();

    await this.reloadEveryAddressAndNotifyListeners(nodesAddrList);
  }

  public async subscribeToContractChanges() {
    this.storageCt.on('SNodeMappingChanged', async (nodeList: string[]) => {
      this.log.info(`EVENT: SNodeMappingChanged: nodeList=${JSON.stringify(nodeList)}`);
      await this.reloadEveryAddressAndNotifyListeners(nodeList);
    });
  }

  // todo we can add 1 contract call for all addrs
  async reloadEveryAddressAndNotifyListeners(nodeAddrList: string[]): Promise<void> {
    for (const nodeAddr of nodeAddrList) {
      let nodeShardmask = await this.storageCt.getNodeShardsByAddr(nodeAddr);
      const shardSet = Coll.arrayToSet(BitUtil.bitsToPositions(nodeShardmask));
      this.nodeShardMap.set(nodeAddr, shardSet);
      this.log.info(`node %s is re-assigned to shards (%s) : %s`,
        nodeAddr, nodeShardmask.toString(2), Coll.setToArray(shardSet));
    }

    this.shardToNodesMap.clear();
    for (const [nodeAddr, shardSet] of this.nodeShardMap) {
      for (const shard of shardSet) {
        let nodes = this.shardToNodesMap.get(shard);
        if (nodes == null) {
          nodes = new Set<string>();
          this.shardToNodesMap.set(shard, nodes);
        }
        nodes.add(nodeAddr);
      }
    }
    let nodeShards: Set<number> = null;
    if (this.useSigner) {
      this.log.info(`this node %s is assigned to shards (%s) : %s`,
        this.nodeAddress,
        Coll.setToArray(this.getNodeShards()));
      nodeShards = this.getNodeShards();
    }
    await this.listener.handleReshard(nodeShards, this.nodeShardMap);
  }

  // fails if this.nodeAddress is not defined
  public getNodeShards(): Set<number> {
    Check.notEmpty(this.nodeAddress);
    const nodeShards = this.nodeShardMap.get(this.nodeAddress);
    Check.notEmptySet(nodeShards);
    return nodeShards;
  }

  public getStorageNodesForShard(shard: number): Set<string> | null {
    return this.shardToNodesMap.get(shard);
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
  handleReshard(currentNodeShards: Set<number> | null, allNodeShards: Map<string, Set<number>>): Promise<void>;
}