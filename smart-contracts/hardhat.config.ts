// noinspection SpellCheckingInspection

import {HardhatUserConfig, task} from "hardhat/config";
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-etherscan')
import "@nomicfoundation/hardhat-toolbox";
import {HardhatRuntimeEnvironment} from "hardhat/types";

require("dotenv").config();

const config: HardhatUserConfig = {
    solidity: "0.8.17",
    // defaultNetwork: "polygon_mumbai",

    networks: {
        hardhat: {},
        polygon_mumbai: {
            url: "https://rpc-mumbai.maticvigil.com",
            accounts: [process.env.PRIVATE_KEY_POLYGON_TESTNET_MUMBAI]
        },
        goerli: {
            url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts: [process.env.PRIVATE_KEY || ""]
        }
    },

    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY
    }
};

export default config;

/* TASKS */


async function printBalance(hre: HardhatRuntimeEnvironment, addr) {
    const pushCt = await hre.ethers.getContractAt("IERC20", process.env.PUSH_TOKEN_ADDRESS);
    console.log(`checking balance of ${addr} in IERC20 ${process.env.PUSH_TOKEN_ADDRESS}`);
    console.log(await pushCt.balanceOf(addr));
}

task("v:balanceForAddr", "prints account balance @ PUSH token")
    .addPositionalParam("address")
    .setAction(async (taskArgs, hre) => {
        await printBalance(hre, taskArgs.address);
    });

task("v:balanceForValidatorContract", "prints validator contract balance  @ PUSH token")
    .setAction(async (taskArgs, hre) => {
        await printBalance(hre, process.env.VALIDATOR_CT_ADDRESS);
    });

task("v:getNodes", "shows validator nodes registered")
    .setAction(async (taskArgs, hre) => {
        const validatorCt = await hre.ethers.getContractAt("ValidatorV1", process.env.VALIDATOR_CT_ADDRESS);
        console.log(`showing validator nodes registered in ${process.env.VALIDATOR_CT_ADDRESS}`);
        console.log(await validatorCt.getNodes());
    });