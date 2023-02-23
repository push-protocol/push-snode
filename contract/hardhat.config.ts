import { HardhatUserConfig } from "hardhat/config";
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-etherscan')
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  networks: {
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
