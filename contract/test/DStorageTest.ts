import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("DSTorageV1", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployDStorageandToken() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const PushToken = await ethers.getContractFactory("PushToken");
    const pushToken = await PushToken.deploy();

    const DStorageV1 = await ethers.getContractFactory("DStorageV1");
    const dstoragev1 = await DStorageV1.deploy(pushToken.address);

    return { pushToken, dstoragev1 , owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should deploy DSTorageV1 and PushToken", async function () {
      const { pushToken, dstoragev1 } = await loadFixture(deployDStorageandToken);

      // Check that the DSTorageV1 contract was deployed
      expect(dstoragev1.address).to.be.properAddress;

      // Check that the PushToken contract was deployed
      expect(pushToken.address).to.be.properAddress;
    });

    it("Should mint 100 Push tokens to address", async function(){
      const { pushToken, dstoragev1, owner } = await loadFixture(deployDStorageandToken);

      //mint 100 tokens to owner
      await pushToken.mint(owner.address, ethers.utils.parseEther("100"));

      // Check that the owner has 100 Push tokens
      expect(await pushToken.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("100"));
    })
    
  });
});
