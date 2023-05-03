import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {HardhatRuntimeEnvironment} from "hardhat/types";

let info = console.log;

export class TaskUtil {
    /**
     *
     * @param pushAddr push smart contract (deployed)
     * @param validatorAddr validator smart contract (deployed)
     * @param nodeOwner the wallet which pays for the node registration
     * @param nodeAddr the wallet which is being used for the node operation (it does not contain tokens)
     * @param amount amount of push tokens
     * @param nodeUrl node api url endpoint
     */
    public static async registerNode(hre:HardhatRuntimeEnvironment,
                                       pushAddr: string, validatorAddr: string,
                                       nodeOwner: SignerWithAddress,
                                       nodeAddr: string, amount: number, nodeUrl: string) {
        info("registerNode()");
        const ethers = hre.ethers;
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
}
