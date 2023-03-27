// noinspection JSUnusedGlobalSymbols

import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {PushToken, ValidatorV1} from "../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";


export class State1 {
    pushContract: PushToken;
    valContract: ValidatorV1;
    owner: SignerWithAddress;
    node1Wallet: SignerWithAddress;
    node2Wallet: SignerWithAddress;

    otherAccount: SignerWithAddress;
    thirdAccount: SignerWithAddress;
}

async function buildState1(): Promise<State1> {
    // Contracts are deployed using the first signer/account by default
    const [owner, node1Wallet, node2Wallet, otherAccount, thirdAccount] = await ethers.getSigners();

    const ptFactory = await ethers.getContractFactory("PushToken");
    const pushContract = await ptFactory.deploy();

    const valFactory = await ethers.getContractFactory("ValidatorV1");
    const valContract = await valFactory.deploy(pushContract.address);

    await pushContract.mint(owner.address, ethers.utils.parseEther("100"));
    await pushContract.approve(valContract.address, ethers.utils.parseEther("1000000000000000"));

    return <State1>{
        pushContract: pushContract,
        valContract: valContract,
        owner: owner,
        node1Wallet: node1Wallet,
        node2Wallet: node2Wallet,
        otherAccount: otherAccount,
        thirdAccount: thirdAccount
    };
}

describe("ValidatorTest", function () {

    it("Deploy Validator contract and Push Contract", async function () {
        console.log("ValidatorTest");
        let {pushContract, valContract} = await buildState1(); //await loadFixture(chain1);
        expect(pushContract.address).to.be.properAddress;
        expect(valContract.address).to.be.properAddress;
        console.log(`push contract at `, pushContract.address);
        console.log(`validator contract at `, valContract.address);
    });

    it("Register 1 Node, insufficient collateral", async function () {
        const {valContract, node1Wallet} = await buildState1();
        await expect(valContract.registerNodeAndStake(50, 0,
            "http://snode1:3000", node1Wallet.address))
            .to.be.revertedWith('Insufficient collateral for VNODE');
    })

    it("Register 1 Node, but not a duplicate public key", async function () {
        const {valContract, owner, node1Wallet, node2Wallet} = await buildState1(); //await loadFixture(chain1);
        {
            let t1 = valContract.registerNodeAndStake(100, 0,
                "http://snode1:3000", node1Wallet.address);
            await expect(t1).to.emit(valContract, "NodeAdded")
                .withArgs(owner.address, node1Wallet.address, 0, 100, "http://snode1:3000");
            let nodeInfo = await valContract.getNodeInfo(node1Wallet.address);
            expect(nodeInfo.status).to.be.equal(0);
            console.log('nodeInfo:', nodeInfo);
        }
        {
            let t1 = valContract.registerNodeAndStake(100, 0,
                "http://snode1:3000", node1Wallet.address);
            await expect(t1).to.be.revertedWith("a node with pubKey is already defined");
        }
    })

    it("Register 2 Nodes", async function () {
        const {valContract, owner, node1Wallet, node2Wallet} = await buildState1();
        {
            let t1 = valContract.registerNodeAndStake(100, 0,
                "http://snode1:3000", node1Wallet.address);
            await expect(t1).to.emit(valContract, "NodeAdded")
                .withArgs(owner.address, node1Wallet.address, 0, 100, "http://snode1:3000");
            let nodeInfo = await valContract.getNodeInfo(node1Wallet.address);
            expect(nodeInfo.status).to.be.equal(0);
            console.log('nodeInfo:', nodeInfo);
        }
        {
            let t1 = valContract.registerNodeAndStake(200, 0,
                "http://snode2:3000", node2Wallet.address);
            await expect(t1).to.emit(valContract, "NodeAdded")
                .withArgs(owner.address, node2Wallet.address, 0, 200, "http://snode2:3000");
            let nodeInfo = await valContract.getNodeInfo(node1Wallet.address);
            expect(nodeInfo.status).to.be.equal(0);
            console.log('nodeInfo:', nodeInfo);
        }
    })
});
describe("Transfer contract ownership", function () {

    it("Transfer ownership if the new owner is different", async function () {
        const {valContract, otherAccount} = await loadFixture(buildState1);
        console.log("Old Owner : ", await valContract.owner());
        await expect(valContract.transferOwnership(otherAccount.address))
            .to.emit(valContract, "LogTransferOwnership");
        console.log("Ownership to be transferred to : ", await valContract.newOwner());
    });

    it("Transfer ownership is not possible if the new owner is same as old owner", async function () {
        const {valContract, otherAccount, owner} = await loadFixture(buildState1);
        await expect(valContract.transferOwnership(owner.address))
            .to.be.revertedWith('Cannot transfer ownership to the current owner.');
    });

    it("Transfer ownership is not possible if the new owner is zero address", async function () {
        const {valContract, otherAccount, owner} = await loadFixture(buildState1);
        await expect(valContract.transferOwnership(ethers.constants.AddressZero))
            .to.be.revertedWith('Cannot transfer ownership to address(0)');
    })

    it("Transfer is only possible by the owner", async function () {
        const {valContract, otherAccount, owner} = await loadFixture(buildState1);
        await expect(valContract.connect(otherAccount).transferOwnership(otherAccount.address))
            .to.be.revertedWith('Only the owner can transfer ownership.');
    });

    it("Accepting ownership is only possible by the new owner", async function () {
        const {valContract, otherAccount} = await loadFixture(buildState1);
        await expect(valContract.transferOwnership(otherAccount.address))
            .to.emit(valContract, "LogTransferOwnership");
        await expect(valContract.connect(otherAccount).acceptOwnership())
            .to.emit(valContract, "LogAcceptOwnership");
    });
    it("Accepting ownership is not possible by any other address", async function () {
        const {pushContract, valContract, owner, otherAccount, thirdAccount} = await loadFixture(buildState1);
        await expect(valContract.transferOwnership(otherAccount.address))
            .to.emit(valContract, "LogTransferOwnership");
        await expect(valContract.connect(thirdAccount).acceptOwnership())
            .to.be.revertedWith('Only the new owner can accept the ownership.');
    });
});

