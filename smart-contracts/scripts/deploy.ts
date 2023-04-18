import {ethers} from "hardhat";
import {config as loadEnvVariables} from "dotenv";

let info = console.log;

async function main() {
    loadEnvVariables();

    // deploy token
    const [owner] = await ethers.getSigners();
    const pushTokenFactory = await ethers.getContractFactory("PushToken");
    const pushToken = await pushTokenFactory.deploy();
    await pushToken.deployed();

    info("PushToken contract: ", pushToken.address);

    // deploy
    const pushTokenAddr = process.env.PUSH_TOKEN_ADDRESS ?? pushToken?.address;
    const validatorV1Factory = await ethers.getContractFactory("ValidatorV1");
    const validator = await validatorV1Factory.deploy(pushTokenAddr);
    await validator.deployed();
    info("Validator contract ", validator.address);

    // give 10k to owner
    await pushToken.mint(owner.address, ethers.utils.parseEther("10000"));
    info("owner ", owner.address);
    info("owner balance ", await pushToken.balanceOf(owner.address));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
