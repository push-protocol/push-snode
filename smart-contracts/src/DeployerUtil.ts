import {PushToken, StorageV1, ValidatorV1} from "../typechain-types";
import {HardhatRuntimeEnvironment} from "hardhat/types";

let log = console.log;


export namespace DeployerUtil {

  export async function deployPushTokenFake(hre: HardhatRuntimeEnvironment): Promise<PushToken> {
    log('deploying PushToken');
    const ptFactory = await hre.ethers.getContractFactory("PushToken");
    const pushContract = <PushToken>await ptFactory.deploy();
    log(`deployed impl: ${pushContract.address}`);
    log('done');
    return pushContract;
  }

  export async function deployValidatorContract(hre: HardhatRuntimeEnvironment, pushCt: string): Promise<ValidatorV1> {
    log('deploying SigUtil library');
    const suFactory = await hre.ethers.getContractFactory("SigUtil");
    const suLibrary = await suFactory.deploy();
    await suLibrary.deployed();
    log('deployed SigUtil at ', suLibrary.address)

    log('deploying ValidatorV1');
    const validatorV1Factory = await hre.ethers.getContractFactory("ValidatorV1",
      {libraries: {SigUtil: suLibrary.address}});
    const protocolVersion = 1;
    const valPerBlockTarget = 5;
    const nodeRandomMinCount = 1;
    const nodeRandomPingCount = 1;
    const REPORTS_BEFORE_SLASH_V = 2; // 10 for prod
    const REPORTS_BEFORE_SLASH_S = 2; // 50 for prod
    const SLASHES_BEFORE_BAN_V = 2;
    const SLASHES_BEFORE_BAN_S = 2;
    const SLASH_PERCENT = 10;
    const BAN_PERCENT = 10;

    const validatorV1Proxy = await upgrades.deployProxy(validatorV1Factory,
      [protocolVersion, pushCt, valPerBlockTarget, nodeRandomMinCount, nodeRandomPingCount,
        REPORTS_BEFORE_SLASH_V, REPORTS_BEFORE_SLASH_S, SLASHES_BEFORE_BAN_V, SLASHES_BEFORE_BAN_S,
        SLASH_PERCENT, BAN_PERCENT],
      {
        kind: "uups",
        unsafeAllowLinkedLibraries: true
      });
    await validatorV1Proxy.deployed();
    log(`deployed proxy: ${validatorV1Proxy.address}`);

    let validatorV1Impl = await upgrades.erc1967.getImplementationAddress(validatorV1Proxy.address);
    log(`deployed impl: ${validatorV1Impl}`);
    log('done');
    return validatorV1Proxy;
  }

  export async function updateValidatorContract(hre: HardhatRuntimeEnvironment, validatorProxyCt: string) {
    const ethers = hre.ethers;
    const [owner] = await hre.ethers.getSigners();
    log(`owner is ${owner.address}`);
    log(`proxy is ${validatorProxyCt}`);
    const validatorV1Factory = await ethers.getContractFactory("ValidatorV1");
    const abi = await upgrades.upgradeProxy(validatorProxyCt, validatorV1Factory, {kind: 'uups'});
    log(`updated proxy at address: ${abi.address}`);
  }

  export async function deployStorageContract(hre: HardhatRuntimeEnvironment, valCt: string): Promise<StorageV1> {
    log('deploying StorageV1')
    let protocolVersion = 1;
    let rfTarget = 5;
    const factory = await hre.ethers.getContractFactory("StorageV1");
    const proxyCt = await upgrades.deployProxy(factory,
      [protocolVersion, valCt, rfTarget],
      {kind: "uups"});
    await proxyCt.deployed();
    log(`deployed proxy: ${proxyCt.address}`);
    let implCt = await upgrades.erc1967.getImplementationAddress(proxyCt.address);
    log(`deployed impl: ${implCt}`);
    log('done');
    return proxyCt;
  }
}

export enum NodeType {
  VNode = 0, // validator 0
  SNode = 1, // storage 1
  DNode = 2 // delivery 2
}