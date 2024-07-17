import {ethers} from "hardhat";
import {config as loadEnvVariables} from "dotenv";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

let info = console.log;



async function main() {
    loadEnvVariables();

    const [owner, node1, node2, node3] = await ethers.getSigners();
    const pushAddr = process.env.VALIDATOR_PUSH_TOKEN_ADDRESS ?? process.exit(1);
    const validatorAddr = process.env.VALIDATOR_CONTRACT_ADDRESS ?? process.exit(1);
    info("pushAddr is ", pushAddr);
    info("validatorAddr is ", validatorAddr);

    await registerNode(pushAddr, validatorAddr, owner,  node1.address,100,  "http://localhost:4001");
    await registerNode(pushAddr, validatorAddr, owner, node2.address,200,  "http://localhost:4002");
    await registerNode(pushAddr, validatorAddr, owner, node3.address, 300, "http://localhost:4003");
}

main().catch((error) => {
    info(error);
    process.exitCode = 1;
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
                            nodeAddr: string, amount: number, nodeUrl:string) {
    const pushCt = await ethers.getContractAt("IERC20", pushAddr, nodeOwner);
    let tx1 = await pushCt.connect(nodeOwner).approve(validatorAddr, amount);
    await tx1.wait();
    info("node ", nodeAddr);

    const validatorCt = await ethers.getContractAt("ValidatorV1", validatorAddr, nodeOwner);
    let tx2 = await validatorCt.connect(nodeOwner).registerNodeAndStake(amount, 0,
        nodeUrl, nodeAddr);
    await tx2.wait();
    let res = await validatorCt.getNodeInfo(nodeAddr);
    info("getNodeInfo:", res);
}