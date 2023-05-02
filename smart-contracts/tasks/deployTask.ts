import {subtask, task, types} from "hardhat/config"
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
// import "ts-node/register"
// import "tsconfig-paths/register"

let info = console.log;

task("v:deployTestPushTokenCt", "register a test push token; owner emits 10k for himself")
    .setAction(async (taskArgs, hre) => {
        const ethers = hre.ethers;
        const [owner] = await hre.ethers.getSigners();
        info(`owner is ${owner.address}`);

        const pushTokenFactory = await ethers.getContractFactory("PushToken");
        const pushToken = await pushTokenFactory.deploy();
        await pushToken.deployed();
        info(`pushToken deployed`);

        const mintAmount = "100000";
        const amount = ethers.utils.parseEther(mintAmount);
        await pushToken.mint(owner.address, amount);
        let finalBalance = await pushToken.balanceOf(owner.address);
        info(`minted ${mintAmount} for owner ${owner.address}, balance is ${finalBalance}`);
        info(`pushToken address: ${pushToken.address}`);
    });


task("v:deployValidatorCt", "deploys validatorCt")
    .addPositionalParam("pushCt", "push token contract")
    .setAction(async (taskArgs, hre) => {
        const ethers = hre.ethers;
        const [owner] = await hre.ethers.getSigners();
        const pushCt = taskArgs.pushCt;
        info(`owner is ${owner.address}`);
        info(`pushcontract is ${pushCt}`);

        const validatorV1Factory = await ethers.getContractFactory("ValidatorV1");
        const validatorV1Proxy = await upgrades.deployProxy(validatorV1Factory,
            [1, pushCt, 1, 1, 1],
            {kind: "uups"});
        await validatorV1Proxy.deployed();
        info(`deployed proxy: ${validatorV1Proxy.address}`);
        let validatorV1Impl = await upgrades.erc1967.getImplementationAddress(validatorV1Proxy.address);
        console.log(`deployed impl: ${validatorV1Impl}`);
    });


task("v:updateValidatorCt", "redeploys a new validatorCt")
    .addPositionalParam("validatorProxyCt", "validatorCt proxy address")
    .setAction(async (taskArgs, hre) => {
        const ethers = hre.ethers;
        const [owner] = await hre.ethers.getSigners();
        const validatorProxyCt = taskArgs.validatorProxyCt;
        info(`owner is ${owner.address}`);
        info(`proxy is ${validatorProxyCt}`);

        const validatorV1Factory = await ethers.getContractFactory("ValidatorV1");
        const abi = await upgrades.upgradeProxy(validatorProxyCt, validatorV1Factory, {kind: 'uups'});
        info(`updated proxy at address: ${abi.address}`);

        // let validatorV1ImplCt = await upgrades.erc1967.getImplementationAddress(validatorProxyCt.address);
        // let proxyAdminCt = await upgrades.erc1967.getAdminAddress(validatorProxyCt.address);
        // console.log("contract is ", validatorV1ImplCt);
        // console.log("proxyAdmin is ", proxyAdminCt);


    });


task("v:registerValidator", "redeploys a new validatorCt")
    .addParam("validatorProxyCt", "validatorCt proxy address")
    .addParam("pushCt", "push token contract")
    .addPositionalParam("nodeAddress", "")
    .addPositionalParam("nodeUrl", "")
    .addPositionalParam("nodeAmount", "")
    .setAction(async (args, hre) => {
        const ethers = hre.ethers;
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
        await registerNode(pushCt, validatorProxyCt, nodeOwner, nodeAddress, nodeAmount, nodeUrl);
        info(`success`);
    });


/**
 *
 * @param pushAddr push smart contract (deployed)
 * @param validatorAddr validator smart contract (deployed)
 * @param nodeOwner the wallet which pays for the node registration
 * @param nodeAddr the wallet which is being used for the node operation (it does not contain tokens)
 * @param amount amount of push tokens
 * @param nodeUrl node api url endpoint
 */
async function registerNode(pushAddr: string, validatorAddr: string,
                            nodeOwner: SignerWithAddress,
                            nodeAddr: string, amount: number, nodeUrl: string) {
    info("registerNode()");
    const pushCt = await ethers.getContractAt("IERC20", pushAddr, nodeOwner);
    let tx1 = await pushCt.connect(nodeOwner).approve(validatorAddr, amount);
    await tx1.wait();
    info("node ", nodeAddr);
/*
    const validatorCt = await ethers.getContractAt("ValidatorV1", validatorAddr, nodeOwner);
    let tx2 = await validatorCt.connect(nodeOwner).registerNodeAndStake(amount, 0,
        nodeUrl, nodeAddr);
    await tx2.wait();
    let res = await validatorCt.getNodeInfo(nodeAddr);
    info("getNodeInfo:", res);*/
}