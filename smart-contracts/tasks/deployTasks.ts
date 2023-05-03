import {subtask, task, types} from "hardhat/config"

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
    });