import {time, loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {anyValue} from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {Contract} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

let info = console.log;

class DeployInfo {
  storageCt: Contract;
  owner: SignerWithAddress;
}

async function state1(): Promise<DeployInfo> {
  info('building snapshot');
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount, thirdAccount] = await ethers.getSigners();

  const storageCtFactory = await ethers.getContractFactory("StorageV1");
  const storageCt = await storageCtFactory.deploy();

  return {storageCt, owner};
}

describe("StorageTest", function () {
  it("Test1", async function () {
    const {storageCt, owner} = await loadFixture(state1);
    expect(storageCt.address).to.be.properAddress;

    let t1 = await storageCt.addNodeAndStake('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    await expect(t1).to.emit(storageCt, "SNodeMappingChanged")
      .withArgs([1]);

    let nodeCount = await storageCt.nodeListLength();
    info('node count is ' , nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      let nodeId = storageCt
    }

    info('finished test1.');

  });
});