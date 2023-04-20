// noinspection SpellCheckingInspection

import {HardhatUserConfig, task} from "hardhat/config";

require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-etherscan')
import "@nomicfoundation/hardhat-toolbox";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";

let log = console.log;
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
const pushTokenAddr = process.env.VALIDATOR_PUSH_TOKEN_ADDRESS;
const validatorCtAddr = process.env.VALIDATOR_CONTRACT_ADDRESS;


/**
 *
 * @param pushAddr push smart contract (deployed)
 * @param validatorAddr validator smart contract (deployed)
 * @param nodeOwner the wallet which pays for the node registration
 * @param nodeAddr the wallet which is being used for the node operation (it does not contain tokens)
 * @param amount amount of push tokens
 * @param nodeUrl node api url endpoint
 */
async function registerNode(hre: HardhatRuntimeEnvironment,
                            pushAddr: string, validatorAddr: string,
                            nodeOwner: SignerWithAddress,
                            nodeAddr: string, amount: number, nodeUrl: string) {
    const ethers = hre.ethers;

    const pushCt = await ethers.getContractAt("IERC20", pushAddr, nodeOwner);
    let tx1 = await pushCt.connect(nodeOwner).approve(validatorAddr, amount);
    await tx1.wait();
    log("node ", nodeAddr);

    const validatorCt = await ethers.getContractAt("ValidatorV1", validatorAddr, nodeOwner);
    let tx2 = await validatorCt.connect(nodeOwner).registerNodeAndStake(amount, 0,
        nodeUrl, nodeAddr);
    await tx2.wait();
    let res = await validatorCt.getNodeInfo(nodeAddr);
    log("getNodeInfo:", res);
}

async function printBalance(hre: HardhatRuntimeEnvironment, addr) {
    const pushCt = await hre.ethers.getContractAt("IERC20", pushTokenAddr);
    log(`checking balance of ${addr} in IERC20 ${pushTokenAddr}`);
    log(await pushCt.balanceOf(addr));
}

task("v:info", "shows all properties")
    .setAction(async (taskArgs, hre) => {
        log(`pushTokenAddr=${pushTokenAddr}
        validatorCtAddr=${validatorCtAddr}`)
    });

task("v:balanceForAddr", "prints account balance @ PUSH token")
    .addPositionalParam("address")
    .setAction(async (taskArgs, hre) => {
        await printBalance(hre, taskArgs.address);
    });

task("v:balanceForValidatorContract", "prints validator contract balance  @ PUSH token")
    .setAction(async (taskArgs, hre) => {

        await printBalance(hre, validatorCtAddr);
    });

task("v:getNodes", "shows validator nodes registered")
    .setAction(async (taskArgs, hre) => {
        const validatorCt = await hre.ethers.getContractAt("ValidatorV1", validatorCtAddr);
        log(`showing validator nodes registered in ${validatorCtAddr}`);
        log(await validatorCt.getNodes());
    });

task("v:registerNodeWithRandomWallet", "register a node on behalf of owner " +
    "(he should own @PUSH tokens and approve them for spending by Validator contract)")
    .addPositionalParam("nodeUrl")
    .setAction(async (taskArgs, hre) => {
        const nodeUrl = taskArgs.nodeUrl;
        const ethers = hre.ethers;
        const validatorCt = await ethers.getContractAt("ValidatorV1", validatorCtAddr);

        const randomWallet = ethers.Wallet.createRandom().connect(ethers.provider);
        const nodeCollateralFromOwner = 100;

        const [owner] = await ethers.getSigners();
        log(`registering new node`);
        log(`owner=${owner.address}  
        node wallet address=${randomWallet.address} 
        node wallet private key=${randomWallet.privateKey}
        collateral=${nodeCollateralFromOwner} 
        PUSH url=${nodeUrl}
        `)
        log(`nodes before: `, await validatorCt.getNodes());
        await registerNode(hre, pushTokenAddr, validatorCtAddr, owner,
            randomWallet.address, nodeCollateralFromOwner, nodeUrl);
        log(`nodes after: `, await validatorCt.getNodes());
    });

/*

npx hardhat --network polygon_mumbai v:balanceForValidatorContract
checking balance of 0xe0FcfCa5E1e2dB7F25B92F62307113Fbdfdc4bf2 in IERC20 0x7c34E2Ef947e494b5cf9FF8EBc5bB23226026905
BigNumber { value: "100" }


npx hardhat --network polygon_mumbai v:info
pushTokenAddr=0x7c34E2Ef947e494b5cf9FF8EBc5bB23226026905
        validatorCtAddr=0xe0FcfCa5E1e2dB7F25B92F62307113Fbdfdc4bf2



npx hardhat --network polygon_mumbai v:getNodes
showing validator nodes registered in 0xe0FcfCa5E1e2dB7F25B92F62307113Fbdfdc4bf2
[ '0x47A40E58419C99013305f9559238028CC823fFE1' ]

igx@igxmbp contract % npx hardhat --network polygon_mumbai v:registerNodeWithRandomWallet "http://localhost:4001"
registering new node
owner=0xa8FdBe12dfC9cAFB825E89D2Cd634ce2c666EbB1
        node wallet address=0x47A40E58419C99013305f9559238028CC823fFE1
        node wallet private key=0x47415b01beb052363f0c90b010f4bb80b7739baf116e602612460772a1837c57
        collateral=100
        PUSH url=http://localhost:4001

nodes before:  []
node  0x47A40E58419C99013305f9559238028CC823fFE1
getNodeInfo: [
  '0xa8FdBe12dfC9cAFB825E89D2Cd634ce2c666EbB1',
  '0x47A40E58419C99013305f9559238028CC823fFE1',
  0,
  BigNumber { value: "100" },
  'http://localhost:4001',
  [ 0, 0, reportCounter: 0, slashCounter: 0 ],
  0,
  ownerWallet: '0xa8FdBe12dfC9cAFB825E89D2Cd634ce2c666EbB1',
  nodeWallet: '0x47A40E58419C99013305f9559238028CC823fFE1',
  nodeType: 0,
  nodeTokens: BigNumber { value: "100" },
  nodeApiBaseUrl: 'http://localhost:4001',
  counters: [ 0, 0, reportCounter: 0, slashCounter: 0 ],
  status: 0
]
nodes after:  [ '0x47A40E58419C99013305f9559238028CC823fFE1' ]
igx@igxmbp contract %



*/
