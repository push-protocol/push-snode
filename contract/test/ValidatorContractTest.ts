import {time, loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {anyValue} from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {PushToken, ValidatorV1} from "../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";



async function chain1():Promise<{ pushContract:PushToken, valContract:ValidatorV1, owner:SignerWithAddress }> {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount, thirdAccount] = await ethers.getSigners();

    const ptFactory = await ethers.getContractFactory("PushToken");
    const pushC = await ptFactory.deploy();

    const valFactory = await ethers.getContractFactory("ValidatorV1");
    const valC = await valFactory.deploy(pushC.address);

    await pushC.mint(owner.address, ethers.utils.parseEther("100"));
    await pushC.approve(valC.address, ethers.utils.parseEther("1000000000000000"));

    return {pushContract: pushC, valContract: valC, owner};
}

describe("ValidatorTest", function () {
    it("Should deploy DSTorageV1 and PushToken", test1)
});

async function test1() {
    console.log("ValidatorTest");
    let state = await loadFixture(chain1);
    expect(state.pushContract.address).to.be.properAddress;
    expect(state.valContract.address).to.be.properAddress;
    console.log(`push contract at `, state.pushContract.address);
    console.log(`validator contract at `, state.valContract.address);
}