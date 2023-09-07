// noinspection JSUnusedGlobalSymbols

import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect, assert} from "chai";
import {ethers} from "hardhat";
import {PushToken, ValidatorV1} from "../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const utils = ethers.utils;

function mergeUInt8Arrays(a1: Uint8Array, a2: Uint8Array): Uint8Array {
    // sum of individual array lengths
    let mergedArray = new Uint8Array(a1.length + a2.length);
    mergedArray.set(a1);
    mergedArray.set(a2, a1.length);
    return mergedArray;
}

function getMessageHashJS(message: string) {
    return utils.keccak256(utils.arrayify(message));
}

// doesn't work correctly as the code in the contract
function getEthSignedMessageHashJS(messageHash:string) {
    const prefix = "\x19Ethereum Signed Message:\n32";
    let arr1 = utils.toUtf8Bytes(prefix);
    let arr2 = utils.toUtf8Bytes(messageHash);
    const ethSignedMessage = mergeUInt8Arrays(arr1, arr2);
    return utils.keccak256(ethSignedMessage);
    // return utils.solidityKeccak256(['string', 'string'], [prefix, messageHash]);
}

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
        console.log('started')
        // signers
        const [owner, node1Wallet] = await ethers.getSigners();
        // deploy contract
        const contractFactory = await ethers.getContractFactory("SignatureTest");
        const contract = await contractFactory.deploy();

        // sign the message
        let message = "0xAA";

        console.log(`signingAddress: ${node1Wallet.address}`);
        const hashCalculatedByContract = await contract.getMessageHash(message);
        const sig = await node1Wallet.signMessage(ethers.utils.arrayify(hashCalculatedByContract));
        const ethHash = await contract.getEthSignedMessageHash(hashCalculatedByContract);

        const hashCalculatedByJs = getMessageHashJS(message);
        assert.equal(hashCalculatedByJs, hashCalculatedByContract);


        console.log("signer          ", node1Wallet.address)
        console.log("recovered signer", await contract.recoverSigner(ethHash, sig));

        // Correct signature and message returns true
        expect(
            await contract.verify(message, node1Wallet.address, sig)
        ).to.equal(true)

        // Incorrect message returns false
        expect(
            await contract.verify(message + "01", node1Wallet.address, sig)
        ).to.equal(false)
    })
});


async function checkSignature(message: string, signatureHex: string) {
    let sigDetails = ethers.utils.splitSignature(signatureHex);
    let signingAddress: string = ethers.utils.verifyMessage(message, sigDetails);
    console.log(`checkSignature() message: ${message} signature: ${signatureHex} signingAddress: ${signingAddress} \n`);
}