import {Service} from 'typedi'
import {Contract, ethers, Wallet} from 'ethers'
import {StrUtil} from '../../utilz/strUtil'

import fs, {readFileSync} from 'fs'
import path from 'path'
import {JsonRpcProvider} from '@ethersproject/providers/src.ts/json-rpc-provider'
import {EnvLoader} from '../../utilz/envLoader'
import {Logger} from 'winston'
import {WinstonUtil} from '../../utilz/winstonUtil'
import {URL} from 'url'

/*
Validator contract abstraction.
All blockchain goes here
 */
@Service()
export class ValidatorContractState {
  nodeId: string
  wallet: Wallet

  public static log: Logger = WinstonUtil.newLog(ValidatorContractState)
  log = ValidatorContractState.log;

  private contractFactory: ContractClientFactory
  public contractCli: ValidatorCtClient

  public async postConstruct() {
    this.log.info('ValidatorContractState.postConstruct()')
    this.contractFactory = new ContractClientFactory()
    this.contractCli = await this.contractFactory.buildRWClient(this.log)
    await this.contractCli.connect()
    // this.log.info('loaded %o ', this.contractCli.nodeMap)
    this.wallet = this.contractFactory.nodeWallet;
    this.nodeId = this.wallet.address;
    if (!this.wallet) throw new Error('wallet is not loaded')
    if (this.contractCli.vnodes == null) throw new Error('Nodes are not initialized')
  }

  public isActiveValidator(nodeId: string): boolean {
    const vi = this.contractCli.vnodes.get(nodeId)
    return vi != null
  }

  public getAllNodesMap(): Map<string, NodeInfo> {
    return this.contractCli.vnodes
  }

  public getValidatorNodesMap(): Map<string, NodeInfo> {
    return this.contractCli.vnodes
  }

  public getStorageNodesMap(): Map<string, NodeInfo> {
    return this.contractCli.snodes
  }

  public getArchivalNodesMap(): Map<string, NodeInfo> {
    return this.contractCli.anodes
  }

  public getActiveValidatorsExceptSelf(): NodeInfo[] {
    const allNodes = Array.from(this.getAllNodesMap().values())
    const onlyGoodValidators = allNodes.filter(
      (ni) =>
        ni.nodeType == NodeType.VNode &&
        ValidatorContractState.isEnabled(ni) &&
        this.nodeId !== ni.nodeId
    )
    return onlyGoodValidators
  }

  public getActiveValidators(): NodeInfo[] {
    const allNodes = Array.from(this.getAllNodesMap().values())
    const onlyGoodValidators = allNodes.filter(
      (ni) => ni.nodeType == NodeType.VNode && ValidatorContractState.isEnabled(ni)
    )
    return onlyGoodValidators
  }

  public getAllValidatorsExceptSelf(): NodeInfo[] {
    const allNodes = Array.from(this.getAllNodesMap().values())
    const onlyGoodValidators = allNodes.filter(
      (ni) =>
        ni.nodeType == NodeType.VNode &&
        ValidatorContractState.isEnabled(ni) &&
        this.nodeId !== ni.nodeId
    )
    return onlyGoodValidators
  }

  public static isEnabled(ni: NodeInfo) {
    return (
      ni.nodeStatus == NodeStatus.OK ||
      ni.nodeStatus == NodeStatus.Reported ||
      ni.nodeStatus == NodeStatus.Slashed
    )
  }

  // todo work with corrupted url's: returning nulls as of now
  public static fixNodeUrl(nodeUrl: string): string {
    if (nodeUrl.length > 100) {
      ValidatorContractState.log.error('nodeUrl should be less than 100 chars');
      return null;
    }

    try {
      const urlObj = new URL(nodeUrl);
      if(!StrUtil.isEmpty(nodeUrl)) {
        const isLocalDocker = urlObj.hostname.endsWith('.local');
        if (!isLocalDocker && urlObj.protocol === "http:") {
          urlObj.protocol = "https:";
        }
        const replaceLocalDomain = EnvLoader.getPropertyAsBool("LOCALH");
        if (replaceLocalDomain) {
          if (urlObj.hostname.endsWith('.local')) {
            urlObj.hostname = 'localhost';
          }
        }
      }

      let fixedUrl = urlObj.toString();
      if (fixedUrl.endsWith('/')) {
        fixedUrl = fixedUrl.slice(0, -1);
      }
      return fixedUrl;
    } catch (e) {
      ValidatorContractState.log.error(e);
      return null;
    }
  }
}

class ContractClientFactory {
  private validatorCtAddr: string
  private provider: JsonRpcProvider
  private abi: string
  private pushTokenAddr: string
  private validatorRpcEndpoint: string
  private validatorRpcNetwork: number
  private abiDir: string
  private configDir: string
  nodeWallet: Wallet
  // private nodeWallet: Signer;
  private validatorEthKeyPath: string; // new
  private validatorPrivateKeyFileName: string; // old
  private validatorPrivateKeyPass: string
  private nodeAddress: string

  constructor() {
    this.validatorCtAddr = EnvLoader.getPropertyOrFail('VALIDATOR_CONTRACT_ADDRESS')
    this.pushTokenAddr = EnvLoader.getPropertyOrFail('VALIDATOR_PUSH_TOKEN_ADDRESS')
    this.validatorRpcEndpoint = EnvLoader.getPropertyOrFail('VALIDATOR_RPC_ENDPOINT')
    this.validatorRpcNetwork = Number.parseInt(EnvLoader.getPropertyOrFail('VALIDATOR_RPC_NETWORK'))
    this.provider = new ethers.providers.JsonRpcProvider(
      this.validatorRpcEndpoint,
      this.validatorRpcNetwork
    )
    this.configDir = EnvLoader.getPropertyOrFail('CONFIG_DIR');
    this.abiDir = EnvLoader.getPropertyOrDefault('ABI_DIR', this.configDir + "/abi");
    this.abi = ContractClientFactory.loadValidatorContractAbi(this.abiDir, './ValidatorV1.json')
  }

  private static loadValidatorContractAbi(configDir: string, fileNameInConfigDir: string): string {
    const fileAbsolute = path.resolve(configDir, `${fileNameInConfigDir}`)
    const file = fs.readFileSync(fileAbsolute, 'utf8')
    const json = JSON.parse(file)
    const abi = json.abi
    console.log(`abi size:`, abi.length)
    return abi
  }

  // creates a client which can only read blockchain state
  public async buildROClient(log: Logger): Promise<ValidatorCtClient> {
    const contract = new ethers.Contract(this.validatorCtAddr, this.abi, this.provider)
    return new ValidatorCtClient(contract, log)
  }

  // creates a client, using an encrypted private key from disk, so that we could write to the blockchain
  public async buildRWClient(log: Logger): Promise<ValidatorCtClient> {
    this.validatorPrivateKeyFileName = EnvLoader.getPropertyOrFail('VALIDATOR_PRIVATE_KEY_FILE')
    this.validatorPrivateKeyPass = EnvLoader.getPropertyOrFail('VALIDATOR_PRIVATE_KEY_PASS')

    // this is a new variable, which fallbacks to old
    this.validatorEthKeyPath = EnvLoader.getPropertyOrDefault('ETH_KEY_PATH', this.configDir + '/' + this.validatorPrivateKeyFileName);
    const jsonFile = readFileSync(this.validatorEthKeyPath, {encoding: 'utf8', flag: 'r'})
    this.nodeWallet = await Wallet.fromEncryptedJson(jsonFile, this.validatorPrivateKeyPass)
    this.nodeAddress = await this.nodeWallet.getAddress()

    const signer = this.nodeWallet.connect(this.provider)
    const contract = new ethers.Contract(this.validatorCtAddr, this.abi, signer)
    return new ValidatorCtClient(contract, log)
  }
}

interface ValidatorContract {
  valPerBlock(): Promise<number>

  valPerBlockTarget(): Promise<number>

  nodeRandomMinCount(): Promise<number>

  nodeRandomPingCount(): Promise<number>

  getVNodes(): Promise<string[]>

  getSNodes(): Promise<string[]>

  getANodes(): Promise<string[]>

  getNodeInfo(address: string): Promise<NodeInfo2>
}

interface NodeInfo2 {
  shortAddr: number
  ownerWallet: string
  nodeWallet: string
  nodeType: NodeType
  nodeTokens: number
  nodeApiBaseUrl: string
  counters: any
  status: NodeStatus
}

type TypedValidatorContract = ValidatorContract & Contract

// all Validator contract interactions are wrapped into this class
// todo update with new events
export class ValidatorCtClient {
  contract: TypedValidatorContract
  private log: Logger

  // reads on start, updates on events
  vnodes: Map<string, NodeInfo> = new Map<string, NodeInfo>()
  snodes: Map<string, NodeInfo> = new Map<string, NodeInfo>()
  anodes: Map<string, NodeInfo> = new Map<string, NodeInfo>()

  // read on start, updated on change
  public valPerBlock: number
  // read on start, updated on change
  private valPerBlockTarget: number
  // read on start, updated on change
  public nodeRandomMinCount: number
  // read on start, updated on change
  public nodeRandomPingCount: number

  constructor(contract: ethers.Contract, log: Logger) {
    this.contract = <TypedValidatorContract>contract
    this.log = log
  }

  private async loadConstantsAndSubscribeToUpdates() {
    this.valPerBlock = await this.contract.valPerBlock()
    this.valPerBlockTarget = await this.contract.valPerBlockTarget()
    this.log.info(`valPerBlock=${this.valPerBlock}`)
    if (this.valPerBlock == null) {
      throw new Error('valPerBlock is undefined')
    }
    this.contract.on('BlockParamsUpdated', (valPerBlock: number, valPerBlockTarget: number) => {
      this.valPerBlock = valPerBlock
      this.valPerBlockTarget = valPerBlockTarget
      this.log.info(`attestersRequired=${this.valPerBlock}`)
    })

    this.nodeRandomMinCount = await this.contract.nodeRandomMinCount()
    this.log.info(`nodeRandomMinCount=${this.nodeRandomMinCount}`)
    if (this.nodeRandomMinCount == null) {
      throw new Error('nodeRandomMinCount is undefined')
    }

    this.nodeRandomPingCount = await this.contract.nodeRandomPingCount()
    this.log.info(`nodeRandomPingCount=${this.nodeRandomPingCount}`)

    this.contract.on(
      'RandomParamsUpdated',
      (nodeRandomMinCount: number, nodeRandomPingCount: number) => {
        this.nodeRandomMinCount = nodeRandomMinCount
        this.nodeRandomPingCount = nodeRandomPingCount
        this.log.info(`nodeRandomMinCount=${this.nodeRandomMinCount}`)
      }
    )
  }

  private async loadVSDNodesAndSubscribeToUpdates() {
    const vNodes = await this.contract.getVNodes()
    for (const nodeAddr of vNodes) {
      const niFromCt = await this.contract.getNodeInfo(nodeAddr)
      const ni = new NodeInfo(
        niFromCt.nodeWallet,
        ValidatorContractState.fixNodeUrl(niFromCt.nodeApiBaseUrl),
        niFromCt.nodeType,
        niFromCt.status
      )
      this.vnodes.set(niFromCt.nodeWallet, ni)
    }
    this.log.info('validator nodes loaded %o', this.vnodes)

    const sNodes = await this.contract.getSNodes()
    for (const nodeAddr of sNodes) {
      const niFromCt = await this.contract.getNodeInfo(nodeAddr)
      const ni = new NodeInfo(
        niFromCt.nodeWallet,
        ValidatorContractState.fixNodeUrl(niFromCt.nodeApiBaseUrl),
        niFromCt.nodeType,
        niFromCt.status
      )
      this.snodes.set(niFromCt.nodeWallet, ni)
    }
    this.log.info('storage nodes loaded %o', this.snodes)

    // turned off unless we will refresh the contract
    if (EnvLoader.getPropertyAsBool('ARCHIVAL_NODES_ON')) {
      const aNodes = await this.contract.getANodes()
      for (const nodeAddr of aNodes) {
        const niFromCt = await this.contract.getNodeInfo(nodeAddr)
        const ni = new NodeInfo(
          niFromCt.nodeWallet,
          ValidatorContractState.fixNodeUrl(niFromCt.nodeApiBaseUrl),
          niFromCt.nodeType,
          niFromCt.status
        )
        this.anodes.set(niFromCt.nodeWallet, ni)
      }
      this.log.info('archival nodes loaded %o', this.anodes)
    }

    this.contract.on(
      'NodeAdded',
      (
        ownerWallet: string,
        nodeWallet: string,
        nodeType: number,
        nodeTokens: number,
        nodeApiBaseUrl: string
      ) => {
        nodeApiBaseUrl = ValidatorContractState.fixNodeUrl(nodeApiBaseUrl);
        this.log.info('NodeAdded %o', arguments)
        this.log.info(
          'NodeAdded %s %s %s %s %s',
          ownerWallet,
          nodeWallet,
          nodeType,
          nodeTokens,
          nodeApiBaseUrl
        )
        const nodeMapByType = this.getNodeMapByType(nodeType)
        const ni = new NodeInfo(nodeWallet, nodeApiBaseUrl, nodeType, NodeStatus.OK)
        nodeMapByType.set(nodeWallet, ni)
        this.log.info(
          'NodeAdded: nodeType: %s , %s -> %s',
          nodeType,
          nodeWallet,
          JSON.stringify(ni)
        )
      }
    )

    this.contract.on(
      'NodeStatusChanged',
      (nodeWallet: string, nodeStatus: number, nodeTokens: number) => {
        this.log.info('NodeStatusChanged', arguments)
        this.log.info('NodeStatusChanged', nodeWallet, nodeStatus, nodeTokens)
        const ni =
          this.vnodes.get(nodeWallet) ?? this.snodes.get(nodeWallet) ?? this.anodes.get(nodeWallet)
        if (ni == null) {
          this.log.error(`unknown node ${nodeWallet}`)
          return
        }
        ni.nodeStatus = nodeStatus
      }
    )
  }

  private getNodeMapByType(nodeType: NodeType) {
    const nodeMapByType: Map<string, NodeInfo> = null
    if (nodeType == NodeType.VNode) {
      return this.vnodes
    } else if (nodeType == NodeType.SNode) {
      return this.snodes
    } else if (nodeType == NodeType.ANode) {
      return this.anodes
    } else {
      throw new Error('unsupported node type ' + nodeType)
    }
  }

  async connect() {
    await this.loadConstantsAndSubscribeToUpdates()
    const result = this.loadNodesFromEnv()
    if (result != null) {
      // we have a debug variable set; no need to do blockchain
      this.vnodes = result
      return
    }
    await this.loadVSDNodesAndSubscribeToUpdates()
  }

  private loadNodesFromEnv(): Map<string, NodeInfo> | null {
    const testValidatorsEnv = process.env.VALIDATOR_CONTRACT_TEST_VALIDATORS
    if (testValidatorsEnv) {
      // test mode
      const testValidators = <{ validators: NodeInfo[] }>JSON.parse(testValidatorsEnv)
      const result = new Map<string, NodeInfo>()
      for (const vi of testValidators.validators) {
        vi.nodeId = StrUtil.normalizeEthAddress(vi.nodeId)
        result.set(vi.nodeId, vi)
      }
      return result
    } else {
      return null
    }
  }
}

// from smart contract
export enum NodeStatus {
  OK,
  Reported,
  Slashed,
  BannedAndUnstaked,
  Unstaked
}

export class NodeInfo {
  nodeId: string
  url: string
  nodeType: NodeType
  nodeStatus: NodeStatus

  constructor(nodeId: string, url: string, nodeType: NodeType, nodeStatus: NodeStatus) {
    this.nodeId = nodeId
    this.url = url
    this.nodeType = nodeType
    this.nodeStatus = nodeStatus
  }
}

export enum NodeType {
  VNode, // validator 0
  SNode, // storage 1
  ANode // archieve 2
}
