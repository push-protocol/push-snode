import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

export class ValidatorContractHelper {
    static utils = ethers.utils;


    static getMessageHashAsInContract(message: string) {
        let utils = ethers.utils;
        return utils.keccak256(utils.arrayify(message));
    }

    static async sign(wallet: SignerWithAddress, message: string): Promise<string> {
        const hash = ValidatorContractHelper.getMessageHashAsInContract(message);
        return await wallet.signMessage(ethers.utils.arrayify(hash));
    }

    static encodeVoteDataToHex(voteAction: number, targetWallet: string): string {
        let abi = ethers.utils.defaultAbiCoder;
        return abi.encode(["uint8", "address"], [voteAction, targetWallet]);
    }

}

export enum NodeStatus {
    OK, // this node operates just fine (DEFAULT VALUE)
    Reported, // he have a few malicious reports
    Slashed, // we already slashed this node at least once (normally we will take -2% of collateral tokens)
    BannedAndUnstaked,   // we banned the node and unstaked it's tokens (normally we will take -10% of collateral tokens)
    Unstaked
}