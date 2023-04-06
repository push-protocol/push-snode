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

    acc1: SignerWithAddress;
    acc2: SignerWithAddress;

    static async build() {
        // Contracts are deployed using the first signer/account by default
        const [owner, node1Wallet, node2Wallet, acc1, acc2] = await ethers.getSigners();

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
            acc1: acc1,
            acc2: acc2
        };
    }
}

describe("Validator Transfer contract ownership", function () {

    it("Transfer ownership if the new owner is different", async function () {
        const {valContract, acc1} = await loadFixture(State1.build);
        console.log("Old Owner : ", await valContract.owner());
        await expect(valContract.transferOwnership(acc1.address))
            .to.emit(valContract, "LogTransferOwnership");
        console.log("Ownership to be transferred to : ", await valContract.newOwner());
    });

    it("Transfer ownership is not possible if the new owner is same as old owner", async function () {
        const {valContract, acc1, owner} = await loadFixture(State1.build);
        await expect(valContract.transferOwnership(owner.address))
            .to.be.revertedWith('Cannot transfer ownership to the current owner.');
    });

    it("Transfer ownership is not possible if the new owner is zero address", async function () {
        /*const {valContract, acc1, owner} =*/
        await loadFixture(State1.build);
        // await expect(valContract.transferOwnership(ethers.constants.AddressZero))
        //     .to.be.revertedWith('Cannot transfer ownership to address(0)');
    })

    it("Transfer is only possible by the owner", async function () {
        const {valContract, acc1, owner} = await loadFixture(State1.build);
        await expect(valContract.connect(acc1).transferOwnership(acc1.address))
            .to.be.revertedWith('Only the owner can transfer ownership.');
    });

    it("Accepting ownership is only possible by the new owner", async function () {
        const {valContract, acc1} = await loadFixture(State1.build);
        await expect(valContract.transferOwnership(acc1.address))
            .to.emit(valContract, "LogTransferOwnership");
        await expect(valContract.connect(acc1).acceptOwnership())
            .to.emit(valContract, "LogAcceptOwnership");
    });
    it("Accepting ownership is not possible by any other address", async function () {
        const {pushContract, valContract, owner, acc1, acc2} = await loadFixture(State1.build);
        await expect(valContract.transferOwnership(acc1.address))
            .to.emit(valContract, "LogTransferOwnership");
        await expect(valContract.connect(acc2).acceptOwnership())
            .to.be.revertedWith('Only the new owner can accept the ownership.');
    });
});


describe("Validator Test1", function () {

    it("Deploy Validator contract and Push Contract", async function () {
        console.log("ValidatorTest");
        let {pushContract, valContract} = await State1.build();
        expect(pushContract.address).to.be.properAddress;
        expect(valContract.address).to.be.properAddress;
        console.log(`push contract at `, pushContract.address);
        console.log(`validator contract at `, valContract.address);
    });

    it("Register 1 Node, insufficient collateral", async function () {
        const {valContract, node1Wallet} = await State1.build();
        await expect(valContract.registerNodeAndStake(50, 0,
            "http://snode1:3000", node1Wallet.address))
            .to.be.revertedWith('Insufficient collateral for VNODE');
    })

    it("Register 1 Node, but not a duplicate public key", async function () {
        const {valContract, owner, node1Wallet, node2Wallet} = await State1.build(); //await loadFixture(chain1);
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
        const {valContract, pushContract, owner, node1Wallet, node2Wallet} = await State1.build();
        {
            let t1 = valContract.registerNodeAndStake(100, 0,
                "http://snode1:3000", node1Wallet.address);
            await expect(t1).to.emit(valContract, "NodeAdded")
                .withArgs(owner.address, node1Wallet.address, 0, 100, "http://snode1:3000");
            let nodeInfo = await valContract.getNodeInfo(node1Wallet.address);
            expect(nodeInfo.status).to.be.equal(0);
        }
        expect(await pushContract.balanceOf(valContract.address)).to.be.equal(100);
        {
            let t1 = valContract.registerNodeAndStake(200, 0,
                "http://snode2:3000", node2Wallet.address);
            await expect(t1).to.emit(valContract, "NodeAdded")
                .withArgs(owner.address, node2Wallet.address, 0, 200, "http://snode2:3000");
            let nodeInfo = await valContract.getNodeInfo(node1Wallet.address);
            expect(nodeInfo.status).to.be.equal(0);
        }
        expect(await pushContract.balanceOf(valContract.address)).to.be.equal(300);
    })
});

class ContractHelper {
    static utils = ethers.utils;


    static getMessageHashAsInContract(message: string) {
        let utils = ethers.utils;
        return utils.keccak256(utils.arrayify(message));
    }

    static async sign(wallet: SignerWithAddress, message: string): Promise<string> {
        const hash = ContractHelper.getMessageHashAsInContract(message);
        return await wallet.signMessage(ethers.utils.arrayify(hash));
    }

    static encodeVoteDataToHex(voteAction: number, targetWallet: string): string {
        let abi = ethers.utils.defaultAbiCoder;
        return abi.encode(["uint8", "address"], [voteAction, targetWallet]);
    }
}


describe("report tests", function () {

    it("report-tc1", async function () {
        const {valContract, pushContract, owner, node1Wallet, node2Wallet} = await State1.build(); //await loadFixture(chain1);

        let message = "0xAA";
        let node1Signature = await ContractHelper.sign(node1Wallet, message);
        let signatures = [node1Signature];
        console.log(`voteData=${message}, signatures=${signatures}`);
        // simulate a read only method - just to get method output
        let result1 = await valContract.callStatic.reportNode(message, signatures);
        console.log(`result=${result1}`);
        expect(result1).to.be.equal(0);
        // let result = await valContract // .connect(node1Wallet)
        //     .reportNode(
        //         message,
        //         signers,
        //         signatures);

    })


    it("report-tc2", async function () {
        // register node1, node2
        // node1 reports on node2 - 2 times
        const {valContract, pushContract, owner, node1Wallet, node2Wallet} = await State1.build(); //await loadFixture(chain1);
        {
            let t1 = valContract.registerNodeAndStake(100, 0,
                "http://snode1:3000", node1Wallet.address);
            await expect(t1).to.emit(valContract, "NodeAdded")
                .withArgs(owner.address, node1Wallet.address, 0, 100, "http://snode1:3000");
            let nodeInfo = await valContract.getNodeInfo(node1Wallet.address);
            expect(nodeInfo.status).to.be.equal(0);
        }
        expect(await pushContract.balanceOf(valContract.address)).to.be.equal(100);
        {
            let t1 = valContract.registerNodeAndStake(200, 0,
                "http://snode2:3000", node2Wallet.address);
            await expect(t1).to.emit(valContract, "NodeAdded")
                .withArgs(owner.address, node2Wallet.address, 0, 200, "http://snode2:3000");
            let nodeInfo = await valContract.getNodeInfo(node1Wallet.address);
            expect(nodeInfo.status).to.be.equal(0);
        }
        expect(await pushContract.balanceOf(valContract.address)).to.be.equal(300);
        {
            let reportThatNode2IsBad = ContractHelper.encodeVoteDataToHex(0, node2Wallet.address);
            let node1Signature = await ContractHelper.sign(node1Wallet, reportThatNode2IsBad);
            let signers = [node1Wallet.address];
            let signatures = [node1Signature];
            console.log(`voteData=${reportThatNode2IsBad}, signers=${signers}, signatures=${signatures}`);

            let contractAsNode1 = valContract.connect(node1Wallet);
            {
                let trans1 = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
                expect((await trans1.wait(1)).status).to.be.equal(1);

                let nodeInfo = await valContract.getNodeInfo(node2Wallet.address);
                expect(nodeInfo.counters.reportCounter).to.be.equal(1);
                console.log(nodeInfo);
            }
            {
                let trans1 = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
                expect((await trans1.wait(1)).status).to.be.equal(1);
                let nodeInfo = await valContract.getNodeInfo(node2Wallet.address);
                console.log(nodeInfo);
                expect(nodeInfo.status).to.be.equal(2); // slashed
                expect(nodeInfo.pushTokensLocked).to.be.equal(198); // -1%
                expect(nodeInfo.counters.reportCounter).to.be.equal(0);
                expect(nodeInfo.counters.slashCounter).to.be.equal(1);
                await expect(trans1).to.emit(valContract, "NodeStatusChanged");
            }
        }

        // todo test unregister node
    })
});
