// noinspection SpellCheckingInspection

import {HardhatUserConfig, task} from "hardhat/config";
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-etherscan')
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();

// task("balance", "Prints an account's balance")
//     .setAction(async () => {});

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  // defaultNetwork: "polygon_mumbai",

  networks: {
    hardhat: {
    },
    polygon_mumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: [process.env.PRIVATE_KEY]
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
