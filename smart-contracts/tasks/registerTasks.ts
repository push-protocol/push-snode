import {task} from "hardhat/config";
import {RegisterUtil} from "../src/RegisterUtil";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {NodeType} from "../src/DeployerUtil";

let info = console.log;

task("v:registerValidator", "adds a new validator node")
    .addParam("validatorProxyCt", "validatorCt proxy address")
    .addParam("pushCt", "push token contract")
    .addPositionalParam("nodeAddress", "")
    .addPositionalParam("nodeUrl", "")
    .addPositionalParam("nodeAmount", "")
    .setAction(async (args, hre) => {
        const validatorProxyCt = args.validatorProxyCt;
        info(`validatorProxyCt is ${validatorProxyCt}`);
        const pushCt = args.pushCt;
        info(`pushCt is ${pushCt}`);
        const [nodeOwner] = await hre.ethers.getSigners();
        info(`nodeOwner is ${nodeOwner.address}`);

        const nodeAddress = args.nodeAddress;
        const nodeUrl = args.nodeUrl;
        const nodeAmount = args.nodeAmount;
        info(`nodeAddress=${nodeAddress}, nodeUrl=${nodeUrl}, nodeAmount=${nodeAmount}`);
        await RegisterUtil.registerNode(hre, pushCt, validatorProxyCt, nodeOwner, nodeAddress, nodeAmount, nodeUrl, 0);
        info(`success`);
    });

task("v:registerDelivery", "adds a new delivery node")
    .addParam("validatorProxyCt", "validatorCt proxy address")
    .addParam("pushCt", "push token contract")
    .addPositionalParam("nodeAddress", "")
    .addPositionalParam("nodeAmount", "")
    .setAction(async (args, hre) => {
        const validatorProxyCt = args.validatorProxyCt;
        info(`validatorProxyCt is ${validatorProxyCt}`);
        const pushCt = args.pushCt;
        info(`pushCt is ${pushCt}`);
        const [nodeOwner] = await hre.ethers.getSigners();
        info(`nodeOwner is ${nodeOwner.address}`);

        const nodeAddress = args.nodeAddress;
        const nodeUrl = '';
        const nodeAmount = args.nodeAmount;
        info(`nodeAddress=${nodeAddress}, nodeUrl=${nodeUrl}, nodeAmount=${nodeAmount}`);
        await RegisterUtil.registerNode(hre, pushCt, validatorProxyCt, nodeOwner, nodeAddress, nodeAmount, nodeUrl, 2);
        info(`success`);
    });

task("v:registerStorage", "adds a new storage node")
  .addParam("validatorProxyCt", "validatorCt proxy address")
  .addParam("pushCt", "push token contract")
  .addPositionalParam("nodeAddress", "")
  .addPositionalParam("nodeUrl", "")
  .addPositionalParam("nodeAmount", "")
  .setAction(async (args, hre) => {
    const validatorProxyCt = args.validatorProxyCt;
    info(`validatorProxyCt is ${validatorProxyCt}`);
    const pushCt = args.pushCt;
    info(`pushCt is ${pushCt}`);
    const [nodeOwner] = await hre.ethers.getSigners();
    info(`nodeOwner is ${nodeOwner.address}`);

    const nodeAddress = args.nodeAddress;
    const nodeUrl = args.nodeUrl;
    const nodeAmount = args.nodeAmount;
    info(`nodeAddress=${nodeAddress}, nodeUrl=${nodeUrl}, nodeAmount=${nodeAmount}`);
    await RegisterUtil.registerNode(hre, pushCt, validatorProxyCt, nodeOwner, nodeAddress, nodeAmount, nodeUrl, NodeType.SNode);
    info(`success`);
  });


task("push:balanceOf", "prints account balance @ PUSH token")
    .addParam("pushCt", "push token contract")
    .addPositionalParam("address")
    .setAction(async (args, hre) => {
        await printBalance(hre, args.pushCt, args.address);
    });



task("v:listNodes", "shows validator nodes registered")
    .addParam("validatorProxyCt", "validatorCt proxy address")
    .setAction(async (args, hre) => {
        const validator = await hre.ethers.getContractAt("ValidatorV1", args.validatorProxyCt);
        info(`showing validator nodes registered in ${args.validatorProxyCt}`);
        info(await validator.getNodes());
    });


async function printBalance(hre: HardhatRuntimeEnvironment, pushCt:string, balanceAddr:string) {
    const push = await hre.ethers.getContractAt("IERC20", pushCt);
    info(`checking balance of ${balanceAddr} in IERC20 ${pushCt}`);
    info(await push.balanceOf(balanceAddr));
}