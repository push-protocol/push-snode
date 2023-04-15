import {ethers} from "hardhat";
import {config as loadEnvVariables} from "dotenv";
import {task} from "hardhat/config";

let info = console.log;

// task("balance", "Prints an account's balance")
//     .setAction(async () => {});

async function main() {
    loadEnvVariables();

    const [owner, node1, node2, node3] = await ethers.getSigners();
    const pushAddr = process.env.PUSH_ADDRESS ?? process.exit(1);
    const validatorAddr = process.env.VALIDATOR_ADDRESS ?? process.exit(1);
    info("pushAddr is ", pushAddr);
    info("validatorAddr is ", validatorAddr);

    let node = node1;
    let amount = 100;

    // const pushCt = await ethers.getContractAt("IERC20", pushAddr, owner);
    // let tx1 = await pushCt.connect(owner).approve(validatorAddr, amount);
    // await tx1.wait();
    info("node ", node.address);

    const validatorCt = await ethers.getContractAt("ValidatorV1", validatorAddr, owner);
    // let tx2 = await validatorCt.connect(owner).registerNodeAndStake(amount, 0,
    //     "http://snode1:3000", node.address);
    // await tx2.wait();
    let res = await validatorCt.getNodeInfo(node.address);
    info("getNodeInfo:", res);
}

main().catch((error) => {
    error(error);
    process.exitCode = 1;
});
