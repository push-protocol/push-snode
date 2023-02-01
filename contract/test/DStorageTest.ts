import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
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

    await pushToken.mint(owner.address, ethers.utils.parseEther("100"));
    await pushToken.approve(dstoragev1.address, ethers.utils.parseEther("1000000000000000"));

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

    it("Should mint Push tokens to address", async function(){
      const { pushToken, dstoragev1, owner } = await loadFixture(deployDStorageandToken);

      //mint 100 tokens to owner
      await pushToken.mint(owner.address, ethers.utils.parseEther("100"));

      // Check that the owner has 100 Push tokens
      expect(await pushToken.balanceOf(owner.address)).greaterThan(ethers.utils.parseEther("0"));
    });
  });

  describe("Registering SNodes", function () {
    it("User should be able to register SNode if collateral is sufficient",async function(){
      const { pushToken, dstoragev1, owner } = await loadFixture(deployDStorageandToken);
      expect(await dstoragev1.registerNode(owner?.address,1,"http://snode1:3000",80)).to.emit(dstoragev1, "NodeAdded").withArgs(owner?.address,'SNode',"http://snode1:3000");
    })

    it("User should be not able to register SNode if collateral is not sufficient",async function(){
      const { pushToken, dstoragev1, owner } = await loadFixture(deployDStorageandToken);
      await expect(dstoragev1.registerNode(owner?.address,1,"http://snode1:3000",50)).to.be.revertedWith('Insufficient collateral for SNODE');
    })
  });

  describe("Registering VNodes", function () {

    it("User should be able to register VNode",async function(){
      const { pushToken, dstoragev1, owner } = await loadFixture(deployDStorageandToken);
      expect(await dstoragev1.registerNode(owner?.address,0,"http://vnode1:4000",100)).to.emit(dstoragev1, "NodeAdded").withArgs(owner?.address,0,"http://vnode1:4000");
    })

    it("User should not be able to register VNode if collateral is insufficient",async function(){
      const { pushToken, dstoragev1, owner } = await loadFixture(deployDStorageandToken);
      await expect(dstoragev1.registerNode(owner?.address,0,"http://vnode1:4000",60)).to.emit(dstoragev1, "NodeAdded").to.be.revertedWith('Insufficient collateral for VNODE');
    })
  });

});
