// noinspection JSUnusedGlobalSymbols

import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {PushToken, ValidatorV1} from "../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

/**
 * Signing
 * https://docs.ethers.org/v4/cookbook-signing.html
 *
 * Signing
 * https://solidity-by-example.org/signature/
 * https://github.com/t4sk/hello-erc20-permit/blob/main/test/verify-signature.js
 */
describe("SignatureTest", function () {

    it("tc1", async function () {
        // signers
        const [owner, node1Wallet] = await ethers.getSigners();
        // deploy contract
        const contractFactory = await ethers.getContractFactory("SignatureTest");
        const contract = await contractFactory.deploy();
        // try to sign, and check this signature in a smart contract
        let message = "0xAA";
        let node1Signature = await node1Wallet.signMessage(message);
        let signers = [node1Wallet.address];
        let signatures = [node1Signature];
        console.log(`message=${message}, signers=${signers}, signatures=${signatures}`);
        let result = await contract // .connect(node1Wallet)
            .testVerify(
                message,
                signers,
                signatures);
        console.log(`result=${result}`);
        expect(result).to.be.true;
    })
});
