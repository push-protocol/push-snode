// noinspection JSUnusedGlobalSymbols

import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect, assert} from "chai";
import {ethers} from "hardhat";
import {PushToken, StorageV2, ValidatorV1} from "../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TestHelper as t} from "./uitlz/TestHelper";
import {NodeStatus, ValidatorHelper} from "./ValidatorHelper";
import {BigNumber, Contract} from "ethers";
import {BitUtil} from "./uitlz/bitUtil";

let log = console.log;


async function deployPushTokenFake(): Promise<PushToken> {
  log('deploying PushToken');
  const ptFactory = await ethers.getContractFactory("PushToken");
  const pushContract = await ptFactory.deploy();
  log(`deployed impl: ${pushContract.address}`);
  log('done');
  return pushContract;
}

async function deployValidatorContract(pushCt: PushToken): Promise<ValidatorV1> {
  log('deploying ValidatorV1');
  const validatorV1Factory = await ethers.getContractFactory("ValidatorV1");
  const validatorV1Proxy = await upgrades.deployProxy(validatorV1Factory,
    [1, pushCt.address, 1, 1, 1],
    {kind: "uups"});
  await validatorV1Proxy.deployed();
  log(`deployed proxy: ${validatorV1Proxy.address}`);

  let validatorV1Impl = await upgrades.erc1967.getImplementationAddress(validatorV1Proxy.address);
  log(`deployed impl: ${validatorV1Impl}`);
  log('done');
  return validatorV1Proxy;
}

async function deployStorageContract(valCt: ValidatorV1): Promise<StorageV2> {
  log('deploying StorageV2')
  let protocolVersion = 1;
  let rfTarget = 5;
  const factory = await ethers.getContractFactory("StorageV2");
  const proxyCt = await upgrades.deployProxy(factory,
    [protocolVersion, valCt.address, rfTarget],
    {kind: "uups"});
  await proxyCt.deployed();
  log(`deployed proxy: ${proxyCt.address}`);
  let implCt = await upgrades.erc1967.getImplementationAddress(proxyCt.address);
  log(`deployed impl: ${implCt}`);
  log('done');
  return proxyCt;
}

export enum NodeType {
  VNode = 0, // validator 0
  SNode = 1, // storage 1
  DNode = 2 // delivery 2
}

// VARIABLES FOR TESTS
let valCt: ValidatorV1;
let pushCt: PushToken;
let storeCt: StorageV2;
let owner: SignerWithAddress;
let signers: SignerWithAddress[];
let acc1: SignerWithAddress;
let acc2: SignerWithAddress;
let vnode1: SignerWithAddress;
let vnode2: SignerWithAddress;
let snode1: SignerWithAddress;
let snode2: SignerWithAddress;

class DeployInfo {
  pushCt: PushToken;
  valCt: ValidatorV1;
  storeCt: StorageV2;
  signers: SignerWithAddress[];
}

async function initBlockchain(): Promise<DeployInfo> {
  log('building snapshot');

  // Contracts are deployed using the first signer/account by default
  const signers = await ethers.getSigners();
  const [owner_] = signers;

  const pushCt = await deployPushTokenFake();

  const valCt = await deployValidatorContract(pushCt);

  const storeCt = await deployStorageContract(valCt);
  await valCt.setStorageContract(storeCt.address);

  await pushCt.mint(owner_.address, ethers.utils.parseEther("100"));
  await pushCt
    .connect(owner_)
    .approve(valCt.address, ethers.utils.parseEther("1000000000000000"));

  return {pushCt, valCt, storeCt, signers};
}

async function beforeEachInit() {
  const di = await loadFixture(initBlockchain);
  pushCt = di.pushCt;
  valCt = di.valCt;
  storeCt = di.storeCt;
  owner = di.signers[0];
  signers = di.signers;

  acc1 = signers[1];
  acc2 = signers[2];
  vnode1 = signers[3];
  vnode2 = signers[4];

  snode1 = signers[5];
  snode2 = signers[6];

}


describe("vto Valdator - ownership tests", function () {

  beforeEach(beforeEachInit);

  it('tdi transfer to a different owner', async function () {
    const oldOwner = await valCt.owner();
    assert.notEqual(oldOwner, acc1.address);

    const transferTx = valCt.transferOwnership(acc1.address);
    await expect(transferTx).to.emit(valCt, "OwnershipTransferStarted");

    const acceptTx = valCt.connect(acc1).acceptOwnership();
    await expect(acceptTx).to.emit(valCt, 'OwnershipTransferred');
    const newOwner = await valCt.owner();

    assert.equal(newOwner, acc1.address);
  });

  it("tbno tranfer by a non-owner", async function () {
    const transferTx = valCt.connect(acc1).transferOwnership(acc1.address);
    await expect(transferTx).to.be.reverted;
  });

  it("ta3 transfer accepted by 3rd party", async function () {
    const transferTx = valCt.transferOwnership(acc1.address);
    await expect(transferTx).to.emit(valCt, "OwnershipTransferStarted");

    const acceptTx = valCt.connect(acc2).acceptOwnership();
    await expect(acceptTx).to.be.reverted;

  });
});

describe("vrn Validator - register nodes tests", function () {

  beforeEach(beforeEachInit);

  it("Deploy Validator contract and Push Contract", async function () {
    expect(pushCt.address).to.be.properAddress;
    expect(valCt.address).to.be.properAddress;
    log(`push contract at `, pushCt.address);
    log(`validator contract at `, valCt.address);
  });

  it("Register 1 Node, insufficient collateral", async function () {
    await expect(valCt.registerNodeAndStake(50, 0,
      "http://snode1:3000", vnode1.address))
      .to.be.revertedWith('Insufficient collateral for VNODE');
  })

  it("Register 1 Node, but not a duplicate public key", async function () {
    {
      let t1 = valCt.registerNodeAndStake(100, 0,
        "http://snode1:3000", vnode1.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(owner.address, vnode1.address, 0, 100, "http://snode1:3000");
      let nodeInfo = await valCt.getNodeInfo(vnode1.address);
      expect(nodeInfo.status).to.be.equal(0);
      log('nodeInfo:', nodeInfo);
    }
    {
      let t1 = valCt.registerNodeAndStake(100, 0,
        "http://snode1:3000", vnode1.address);
      await expect(t1).to.be.revertedWith("a node with pubKey is already defined");
    }
  })

  it("Register 2 Nodes", async function () {
    {
      let t1 = valCt.registerNodeAndStake(100, 0,
        "http://snode1:3000", vnode1.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(owner.address, vnode1.address, 0, 100, "http://snode1:3000");
      let nodeInfo = await valCt.getNodeInfo(vnode1.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushCt.balanceOf(valCt.address)).to.be.equal(100);
    {
      let t1 = valCt.registerNodeAndStake(200, 0,
        "http://snode2:3000", vnode2.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(owner.address, vnode2.address, 0, 200, "http://snode2:3000");
      let nodeInfo = await valCt.getNodeInfo(vnode1.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushCt.balanceOf(valCt.address)).to.be.equal(300);
    {
      let t2 = await valCt.getNodes();
      log(t2);
    }
  })
});


describe("vnro Validator - node reports on other node", function () {

  beforeEach(beforeEachInit);

  it("report-tc1", async function () {
    let message = "0xAA";
    let node1Signature = await ValidatorHelper.sign(vnode1, message);
    let signatures = [node1Signature];
    log(`voteData=${message}, signatures=${signatures}`);
    // simulate a read only method - just to get method output
    let result1 = await valCt.callStatic.reportNode(message, signatures);
    log(`result=${result1}`);
    expect(result1).to.be.equal(0);
  })


  it("report-tc2 / register 2 nodes / report / report / slash / report / report / ban", async function () {
    // register node1, node2
    {
      let t1 = valCt.registerNodeAndStake(100, 0,
        "http://snode1:3000", vnode1.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(owner.address, vnode1.address, 0, 100, "http://snode1:3000");
      let nodeInfo = await valCt.getNodeInfo(vnode1.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushCt.balanceOf(valCt.address)).to.be.equal(100);
    {
      let t1 = valCt.registerNodeAndStake(200, 0,
        "http://snode2:3000", vnode2.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(owner.address, vnode2.address, 0, 200, "http://snode2:3000");
      let nodeInfo = await valCt.getNodeInfo(vnode1.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushCt.balanceOf(valCt.address)).to.be.equal(300);
    {
      let reportThatNode2IsBad = ValidatorHelper.encodeVoteDataToHex(0, vnode2.address);
      let node1Signature = await ValidatorHelper.sign(vnode1, reportThatNode2IsBad);
      let signers = [vnode1.address];
      let signatures = [node1Signature];
      log(`voteData=${reportThatNode2IsBad}, signers=${signers}, signatures=${signatures}`);

      let contractAsNode1 = valCt.connect(vnode1);
      {
        // node1 reports on node2 (1st report)
        let tx = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
        await t.confirmTransaction(tx);

        let nodeInfo = await valCt.getNodeInfo(vnode2.address);
        expect(nodeInfo.counters.reportCounter).to.be.equal(1);

        let bn: BigNumber = BigNumber.from(1);
        expect(bn instanceof BigNumber).to.be.true;

        await t.expectEventFirst(tx, {
          nodeWallet: vnode2.address,
          nodeStatus: NodeStatus.Reported,
          nodeTokens: 200
        });
      }
      {
        // node1 reports on node2 (2nd report - slash occurs - NodeStatusChanged event )
        let tx = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
        await t.confirmTransaction(tx);

        let nodeInfo = await valCt.getNodeInfo(vnode2.address);
        log(nodeInfo);
        expect(nodeInfo.status).to.be.equal(2); // slashed
        expect(nodeInfo.nodeTokens).to.be.equal(198); // -1%
        expect(nodeInfo.counters.reportCounter).to.be.equal(0);
        expect(nodeInfo.counters.slashCounter).to.be.equal(1);

        await t.expectEvent(tx, 0, {
          nodeWallet: vnode2.address,
          nodeStatus: NodeStatus.Reported,
          nodeTokens: 200
        });

        await t.expectEvent(tx, 1, {
          nodeWallet: vnode2.address,
          nodeStatus: NodeStatus.Slashed,
          nodeTokens: 198
        });
      }
      {
        // node1 reports on node2 (3rd - NodeStatusChanged event)
        let tx = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
        await t.confirmTransaction(tx);

        let nodeInfo = await valCt.getNodeInfo(vnode2.address);
        expect(nodeInfo.counters.reportCounter).to.be.equal(1);
        log(nodeInfo);

        await t.expectEventFirst(tx, {
          nodeWallet: vnode2.address,
          nodeStatus: NodeStatus.Reported,
          nodeTokens: 198
        });
      }
      {
        // node1 reports on node2 (4th - 2nd slash occurs - NodeStatusChanged event
        // and then ban occurs - NodeStatusChanged event)
        let tx = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
        await t.confirmTransaction(tx);
        let nodeInfo = await valCt.getNodeInfo(vnode2.address);
        log('4th report');
        log(nodeInfo);
        expect(nodeInfo.status).to.be.equal(3); // banned
        expect(nodeInfo.nodeTokens).to.be.equal(0); // because we unstaked automatically
        expect(nodeInfo.counters.reportCounter).to.be.equal(0);
        expect(nodeInfo.counters.slashCounter).to.be.equal(2);
        log('events ', (await tx.wait(1)).events);
        await t.expectEvent(tx, 0, {
          nodeWallet: vnode2.address,
          nodeStatus: NodeStatus.Reported,
          nodeTokens: 198
        });
        await t.expectEvent(tx, 1, {
          nodeWallet: vnode2.address,
          nodeStatus: NodeStatus.Slashed,
          nodeTokens: 196
        });
        await t.expectEvent(tx, 2, {
          nodeWallet: vnode2.address,
          nodeStatus: NodeStatus.BannedAndUnstaked,
          nodeTokens: 0
        });
      }
    }
  })

  // STORAGE NODE ---------------------------------------------------------------------------------

  it("asn add storage node to both Validator and Storage contracts", async function () {
    // register node1, node2
    const allShards = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
      30, 31];
    {
      let t1 = valCt.registerNodeAndStake(100, NodeType.SNode, "", snode1.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(owner.address, snode1.address, NodeType.SNode, 100, "");
      let nodeInfo = await valCt.getNodeInfo(snode1.address);
      expect(nodeInfo.status).to.be.equal(0);

      const bitmask = await storeCt.getNodeShardsByAddr(snode1.address);
      assert.deepEqual(BitUtil.bitsToPositions(bitmask), allShards);
    }
    {
      let t1 = valCt.registerNodeAndStake(100, NodeType.SNode, "", snode2.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(owner.address, snode2.address, NodeType.SNode, 100, "");
      let nodeInfo = await valCt.getNodeInfo(snode2.address);
      expect(nodeInfo.status).to.be.equal(0);

      const bitmask1 = await storeCt.getNodeShardsByAddr(snode1.address);
      log(bitmask1.toString(2));
      assert.deepEqual(BitUtil.bitsToPositions(bitmask1), allShards);
      const bitmask2 = await storeCt.getNodeShardsByAddr(snode1.address);
      log(bitmask2.toString(2));
      assert.deepEqual(BitUtil.bitsToPositions(bitmask2), allShards);
    }
    expect(await pushCt.balanceOf(valCt.address)).to.be.equal(200);
  });


  describe("vuns Validator - Test unstake", function () {

    beforeEach(beforeEachInit);

    it("unstake-test-1 :: register 1 node / unstake to bad address / unstake to owner address", async function () {
      // register 1 node (+ check all amounts before and after)
      {
        let ownerBalanceBefore = await pushCt.balanceOf(owner.address);
        let valContractBalanceBefore = await pushCt.balanceOf(valCt.address);
        let valContractAllowanceForOwner = await pushCt.allowance(owner.address, valCt.address);
        log(`before registerNodeAndStake: owner=${ownerBalanceBefore}, valContract=${valContractBalanceBefore}, valContractAllowanceForOwner=${valContractAllowanceForOwner}`);
        expect(valContractAllowanceForOwner).to.be.greaterThan(100);

        let tx = await valCt
          .connect(owner)
          .registerNodeAndStake(100, 0,
            "http://snode1:3000", vnode1.address);
        await t.confirmTransaction(tx);

        let ownerBalanceAfter = await pushCt.balanceOf(owner.address);
        let valContractBalanceAfter = await pushCt.balanceOf(valCt.address);
        log(`after registerNodeAndStake:  owner=${ownerBalanceAfter}, valContract=${valContractBalanceAfter}`);
        expect((valContractBalanceAfter.sub(valContractBalanceBefore))).to.be.equal(100);
        expect((ownerBalanceAfter.sub(ownerBalanceBefore))).to.be.equal(-100);

        await expect(tx)
          .to.emit(valCt, "NodeAdded")
          .withArgs(owner.address, vnode1.address, 0, 100, "http://snode1:3000");
        let nodeInfo = await valCt.getNodeInfo(vnode1.address);
        expect(nodeInfo.status).to.be.equal(0);
      }
      expect(await pushCt.balanceOf(valCt.address)).to.be.equal(100);
      // non-owner calls unstake
      {
        let tx = valCt
          .connect(vnode2)
          .unstakeNode(vnode1.address);
        await expect(tx).revertedWith('only owner can unstake a node');
      }
      // owner calls unstake
      {
        let ni1 = await valCt.getNodeInfo(vnode1.address);
        expect(ni1.status).to.be.equal(0);
        expect(ni1.nodeTokens).to.be.equal(100);


        let ownerBalanceBefore = await pushCt.balanceOf(owner.address);
        let valContractBalanceBefore = await pushCt.balanceOf(valCt.address);
        log(`before unstake: owner=${ownerBalanceBefore}, valContract=${valContractBalanceBefore}`);

        let tx = await valCt
          .connect(owner)
          .unstakeNode(vnode1.address);
        await t.confirmTransaction(tx);

        let nodeInfo = await valCt.getNodeInfo(vnode1.address);
        expect(nodeInfo.status).to.be.equal(NodeStatus.Unstaked);
        expect(nodeInfo.nodeTokens).to.be.equal(0);

        let ownerBalanceAfter = await pushCt.balanceOf(owner.address);
        let valContractBalanceAfter = await pushCt.balanceOf(valCt.address); // todo !!!!
        log(`after unstake: owner=${ownerBalanceAfter}, valContract=${valContractBalanceAfter}`);
        expect((valContractBalanceAfter.sub(valContractBalanceBefore))).to.be.equal(-100);
        expect((ownerBalanceAfter.sub(ownerBalanceBefore))).to.be.equal(+100);

        await expect(tx)
          .to.emit(valCt, "NodeStatusChanged")
          .withArgs(vnode1.address, NodeStatus.Unstaked, 0);
      }

    })
  });

});
