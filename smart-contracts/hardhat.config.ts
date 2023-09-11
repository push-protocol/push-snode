// noinspection SpellCheckingInspection

import {HardhatUserConfig, task} from "hardhat/config";

require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-etherscan')
import "@nomicfoundation/hardhat-toolbox";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

require("dotenv").config();

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.17",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000,
            },
        },
    },
    // defaultNetwork: "polygon_mumbai",

    networks: {
        hardhat: {
            gas: 30000000
        },
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
import "./tasks/deployTasks"
import "./tasks/keyTasks"
import "./tasks/registerTasks"