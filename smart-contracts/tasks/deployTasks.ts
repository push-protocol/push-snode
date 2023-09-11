import {subtask, task, types} from "hardhat/config"
import {PushToken, StorageV1, ValidatorV1} from "../typechain-types";
import {ethers} from "hardhat";
import {DeployerUtil} from "../src/DeployerUtil";

let log = console.log;

task("v:deployTestPushTokenCt", "register a test push token; owner emits 10k for himself")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;
    const [owner] = await hre.ethers.getSigners();
    log(`owner is ${owner.address}`);

    const pushToken = await DeployerUtil.deployPushTokenFake(hre);
    log(`pushToken deployed`);

    const mintAmount = "100000";
    const amount = ethers.utils.parseEther(mintAmount);
    await pushToken.mint(owner.address, amount);
    let finalBalance = await pushToken.balanceOf(owner.address);
    log(`minted ${mintAmount} for owner ${owner.address}, balance is ${finalBalance}`);
    log(`pushToken address: ${pushToken.address}`);
  });


task("v:deployValidatorCt", "deploys validatorCt")
  .addPositionalParam("pushCt", "push token contract")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;
    const [owner] = await hre.ethers.getSigners();
    const pushCt = taskArgs.pushCt;
    log(`owner is ${owner.address}`);
    log(`pushcontract is ${pushCt}`);

    const validatorCt = await DeployerUtil.deployValidatorContract(hre, pushCt);
  });


task("v:updateValidatorCt", "redeploys a new validatorCt")
  .addPositionalParam("validatorProxyCt", "validatorCt proxy address")
  .setAction(async (taskArgs, hre) => {
    await DeployerUtil.updateValidatorContract(hre, taskArgs.validatorProxyCt);
  });


task("v:deployStorageCt", "deploys validatorCt and registers it into validator contract")
  .addPositionalParam("validatorContract", "validator contract")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;
    const [owner] = await hre.ethers.getSigners();
    const pushCt = taskArgs.pushCt;
    const valCtAddr: string = taskArgs.validatorContract;
    log('deploying storage contract')
    const storeCt = await DeployerUtil.deployStorageContract(hre, valCtAddr);
    log(`deployed`);

    log(`registering storage contract ${storeCt.address} into validator at ${valCtAddr}`)
    const valCt = await ethers.getContractAt("ValidatorV1", valCtAddr, owner);
    await valCt.setStorageContract(storeCt.address);
    log(`validatorContract successfully registered new address: `, await valCt.storageContract());
  });
