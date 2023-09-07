// noinspection JSUnusedGlobalSymbols

import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect, assert} from "chai";
import {ethers} from "hardhat";
import {PushToken, ValidatorV1} from "../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TestHelper as t} from "./uitlz/TestHelper";
import {NodeStatus, ValidatorHelper} from "./ValidatorHelper";
import {BigNumber, Contract} from "ethers";

let log = console.log;


async function deployPushTokenFake(): Promise<PushToken> {
  const ptFactory = await ethers.getContractFactory("PushToken");
  const pushContract = await ptFactory.deploy();
  return pushContract;
}

async function deployValidatorContract(pushCt: PushToken) {
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

async function deployStorageContract(valCt: ValidatorV1): Promise<string> {
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
  return proxyCt.address;
}

export enum NodeType {
  VNode = 0, // validator 0
  SNode = 1, // storage 1
  DNode = 2 // delivery 2
}


export class State1 {
  pushContract_: PushToken;
  valContract_: ValidatorV1;
  owner_: SignerWithAddress;

  node1Wallet_: SignerWithAddress;
  node2Wallet_: SignerWithAddress;

  acc1_: SignerWithAddress;
  acc2_: SignerWithAddress;

  static async build() {
    log('building snapshot');

    log('deploying ValidatorV1');
    // Contracts are deployed using the first signer/account by default
    const [owner, node1Wallet, node2Wallet, acc1, acc2] = await ethers.getSigners();

    const pushCt = await deployPushTokenFake();

    const valCt = await deployValidatorContract(pushCt);

    const storeCt = await deployStorageContract(valCt);
    await valCt.setStorageContract(storeCt);

    await pushCt.mint(owner.address, ethers.utils.parseEther("100"));
    await pushCt
      .connect(owner)
      .approve(valCt.address, ethers.utils.parseEther("1000000000000000"));

    // todo remove
    return <State1>{
      pushContract_: pushCt,
      valContract_: valCt,
      owner_: owner,
      node1Wallet_: node1Wallet,
      node2Wallet_: node2Wallet,
      acc1_: acc1,
      acc2_: acc2
    };
  }
}


describe("vto Valdator - ownership tests", function () {
  let valCt: ValidatorV1;
  let owner: SignerWithAddress;
  let acc1: SignerWithAddress;
  let acc2: SignerWithAddress;

  beforeEach(async () => {
    const s = await loadFixture(State1.build);
    valCt = s.valContract_;
    acc1 = s.acc1_;
    owner = s.owner_;
    acc2 = s.acc2_;
  })

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

  it("Deploy Validator contract and Push Contract", async function () {
    log("ValidatorTest");
    let {pushContract_, valContract_} = await loadFixture(State1.build);
    expect(pushContract_.address).to.be.properAddress;
    expect(valContract_.address).to.be.properAddress;
    log(`push contract at `, pushContract_.address);
    log(`validator contract at `, valContract_.address);
  });

  it("Register 1 Node, insufficient collateral", async function () {
    const {valContract_, node1Wallet_} = await loadFixture(State1.build);
    await expect(valContract_.registerNodeAndStake(50, 0,
      "http://snode1:3000", node1Wallet_.address))
      .to.be.revertedWith('Insufficient collateral for VNODE');
  })

  it("Register 1 Node, but not a duplicate public key", async function () {
    const {valContract_, owner_, node1Wallet_, node2Wallet_} = await loadFixture(State1.build);
    {
      let t1 = valContract_.registerNodeAndStake(100, 0,
        "http://snode1:3000", node1Wallet_.address);
      await expect(t1).to.emit(valContract_, "NodeAdded")
        .withArgs(owner_.address, node1Wallet_.address, 0, 100, "http://snode1:3000");
      let nodeInfo = await valContract_.getNodeInfo(node1Wallet_.address);
      expect(nodeInfo.status).to.be.equal(0);
      log('nodeInfo:', nodeInfo);
    }
    {
      let t1 = valContract_.registerNodeAndStake(100, 0,
        "http://snode1:3000", node1Wallet_.address);
      await expect(t1).to.be.revertedWith("a node with pubKey is already defined");
    }
  })

  it("Register 2 Nodes", async function () {
    const {valContract_, pushContract_, owner_, node1Wallet_, node2Wallet_} = await loadFixture(State1.build);
    {
      let t1 = valContract_.registerNodeAndStake(100, 0,
        "http://snode1:3000", node1Wallet_.address);
      await expect(t1).to.emit(valContract_, "NodeAdded")
        .withArgs(owner_.address, node1Wallet_.address, 0, 100, "http://snode1:3000");
      let nodeInfo = await valContract_.getNodeInfo(node1Wallet_.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushContract_.balanceOf(valContract_.address)).to.be.equal(100);
    {
      let t1 = valContract_.registerNodeAndStake(200, 0,
        "http://snode2:3000", node2Wallet_.address);
      await expect(t1).to.emit(valContract_, "NodeAdded")
        .withArgs(owner_.address, node2Wallet_.address, 0, 200, "http://snode2:3000");
      let nodeInfo = await valContract_.getNodeInfo(node1Wallet_.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushContract_.balanceOf(valContract_.address)).to.be.equal(300);
    {
      let t2 = await valContract_.getNodes();
      log(t2);
    }
  })
});

describe("vnro Validator - node reports on other node", function () {

  it("report-tc1", async function () {
    // todo improve this test
    const {valContract_, pushContract_, owner_, node1Wallet_, node2Wallet_} = await loadFixture(State1.build);

    let message = "0xAA";
    let node1Signature = await ValidatorHelper.sign(node1Wallet_, message);
    let signatures = [node1Signature];
    log(`voteData=${message}, signatures=${signatures}`);
    // simulate a read only method - just to get method output
    let result1 = await valContract_.callStatic.reportNode(message, signatures);
    log(`result=${result1}`);
    expect(result1).to.be.equal(0);
  })


  it("report-tc2 / register 2 nodes / report / report / slash / report / report / ban", async function () {
    // register node1, node2
    const {valContract_, pushContract_, owner_, node1Wallet_, node2Wallet_} = await loadFixture(State1.build);
    {
      let t1 = valContract_.registerNodeAndStake(100, 0,
        "http://snode1:3000", node1Wallet_.address);
      await expect(t1).to.emit(valContract_, "NodeAdded")
        .withArgs(owner_.address, node1Wallet_.address, 0, 100, "http://snode1:3000");
      let nodeInfo = await valContract_.getNodeInfo(node1Wallet_.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushContract_.balanceOf(valContract_.address)).to.be.equal(100);
    {
      let t1 = valContract_.registerNodeAndStake(200, 0,
        "http://snode2:3000", node2Wallet_.address);
      await expect(t1).to.emit(valContract_, "NodeAdded")
        .withArgs(owner_.address, node2Wallet_.address, 0, 200, "http://snode2:3000");
      let nodeInfo = await valContract_.getNodeInfo(node1Wallet_.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushContract_.balanceOf(valContract_.address)).to.be.equal(300);
    {
      let reportThatNode2IsBad = ValidatorHelper.encodeVoteDataToHex(0, node2Wallet_.address);
      let node1Signature = await ValidatorHelper.sign(node1Wallet_, reportThatNode2IsBad);
      let signers = [node1Wallet_.address];
      let signatures = [node1Signature];
      log(`voteData=${reportThatNode2IsBad}, signers=${signers}, signatures=${signatures}`);

      let contractAsNode1 = valContract_.connect(node1Wallet_);
      {
        // node1 reports on node2 (1st report)
        let tx = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
        await t.confirmTransaction(tx);

        let nodeInfo = await valContract_.getNodeInfo(node2Wallet_.address);
        expect(nodeInfo.counters.reportCounter).to.be.equal(1);

        let bn: BigNumber = BigNumber.from(1);
        expect(bn instanceof BigNumber).to.be.true;

        await t.expectEventFirst(tx, {
          nodeWallet: node2Wallet_.address,
          nodeStatus: NodeStatus.Reported,
          nodeTokens: 200
        });
      }
      {
        // node1 reports on node2 (2nd report - slash occurs - NodeStatusChanged event )
        let tx = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
        await t.confirmTransaction(tx);

        let nodeInfo = await valContract_.getNodeInfo(node2Wallet_.address);
        log(nodeInfo);
        expect(nodeInfo.status).to.be.equal(2); // slashed
        expect(nodeInfo.nodeTokens).to.be.equal(198); // -1%
        expect(nodeInfo.counters.reportCounter).to.be.equal(0);
        expect(nodeInfo.counters.slashCounter).to.be.equal(1);

        await t.expectEvent(tx, 0, {
          nodeWallet: node2Wallet_.address,
          nodeStatus: NodeStatus.Reported,
          nodeTokens: 200
        });

        await t.expectEvent(tx, 1, {
          nodeWallet: node2Wallet_.address,
          nodeStatus: NodeStatus.Slashed,
          nodeTokens: 198
        });
      }
      {
        // node1 reports on node2 (3rd - NodeStatusChanged event)
        let tx = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
        await t.confirmTransaction(tx);

        let nodeInfo = await valContract_.getNodeInfo(node2Wallet_.address);
        expect(nodeInfo.counters.reportCounter).to.be.equal(1);
        log(nodeInfo);

        await t.expectEventFirst(tx, {
          nodeWallet: node2Wallet_.address,
          nodeStatus: NodeStatus.Reported,
          nodeTokens: 198
        });
      }
      {
        // node1 reports on node2 (4th - 2nd slash occurs - NodeStatusChanged event
        // and then ban occurs - NodeStatusChanged event)
        let tx = await contractAsNode1.reportNode(reportThatNode2IsBad, [node1Signature]);
        await t.confirmTransaction(tx);
        let nodeInfo = await valContract_.getNodeInfo(node2Wallet_.address);
        log('4th report');
        log(nodeInfo);
        expect(nodeInfo.status).to.be.equal(3); // banned
        expect(nodeInfo.nodeTokens).to.be.equal(0); // because we unstaked automatically
        expect(nodeInfo.counters.reportCounter).to.be.equal(0);
        expect(nodeInfo.counters.slashCounter).to.be.equal(2);
        log('events ', (await tx.wait(1)).events);
        await t.expectEvent(tx, 0, {
          nodeWallet: node2Wallet_.address,
          nodeStatus: NodeStatus.Reported,
          nodeTokens: 198
        });
        await t.expectEvent(tx, 1, {
          nodeWallet: node2Wallet_.address,
          nodeStatus: NodeStatus.Slashed,
          nodeTokens: 196
        });
        await t.expectEvent(tx, 2, {
          nodeWallet: node2Wallet_.address,
          nodeStatus: NodeStatus.BannedAndUnstaked,
          nodeTokens: 0
        });
      }
    }
  })
});

describe("vuns Validator - Test unstake", function () {

  it("unstake-test-1 :: register 1 node / unstake to bad address / unstake to owner address", async function () {
    const {valContract_, pushContract_, owner_, node1Wallet_, node2Wallet_} = await loadFixture(State1.build);
    // register 1 node (+ check all amounts before and after)
    {
      let ownerBalanceBefore = await pushContract_.balanceOf(owner_.address);
      let valContractBalanceBefore = await pushContract_.balanceOf(valContract_.address);
      let valContractAllowanceForOwner = await pushContract_.allowance(owner_.address, valContract_.address);
      log(`before registerNodeAndStake: owner=${ownerBalanceBefore}, valContract=${valContractBalanceBefore}, valContractAllowanceForOwner=${valContractAllowanceForOwner}`);
      expect(valContractAllowanceForOwner).to.be.greaterThan(100);

      let tx = await valContract_
        .connect(owner_)
        .registerNodeAndStake(100, 0,
          "http://snode1:3000", node1Wallet_.address);
      await t.confirmTransaction(tx);

      let ownerBalanceAfter = await pushContract_.balanceOf(owner_.address);
      let valContractBalanceAfter = await pushContract_.balanceOf(valContract_.address);
      log(`after registerNodeAndStake:  owner=${ownerBalanceAfter}, valContract=${valContractBalanceAfter}`);
      expect((valContractBalanceAfter.sub(valContractBalanceBefore))).to.be.equal(100);
      expect((ownerBalanceAfter.sub(ownerBalanceBefore))).to.be.equal(-100);

      await expect(tx)
        .to.emit(valContract_, "NodeAdded")
        .withArgs(owner_.address, node1Wallet_.address, 0, 100, "http://snode1:3000");
      let nodeInfo = await valContract_.getNodeInfo(node1Wallet_.address);
      expect(nodeInfo.status).to.be.equal(0);
    }
    expect(await pushContract_.balanceOf(valContract_.address)).to.be.equal(100);
    // non-owner calls unstake
    {
      let tx = valContract_
        .connect(node2Wallet_)
        .unstakeNode(node1Wallet_.address);
      await expect(tx).revertedWith('only owner can unstake a node');
    }
    // owner calls unstake
    {
      let ni1 = await valContract_.getNodeInfo(node1Wallet_.address);
      expect(ni1.status).to.be.equal(0);
      expect(ni1.nodeTokens).to.be.equal(100);


      let ownerBalanceBefore = await pushContract_.balanceOf(owner_.address);
      let valContractBalanceBefore = await pushContract_.balanceOf(valContract_.address);
      log(`before unstake: owner=${ownerBalanceBefore}, valContract=${valContractBalanceBefore}`);

      let tx = await valContract_
        .connect(owner_)
        .unstakeNode(node1Wallet_.address);
      await t.confirmTransaction(tx);

      let nodeInfo = await valContract_.getNodeInfo(node1Wallet_.address);
      expect(nodeInfo.status).to.be.equal(NodeStatus.Unstaked);
      expect(nodeInfo.nodeTokens).to.be.equal(0);

      let ownerBalanceAfter = await pushContract_.balanceOf(owner_.address);
      let valContractBalanceAfter = await pushContract_.balanceOf(valContract_.address); // todo !!!!
      log(`after unstake: owner=${ownerBalanceAfter}, valContract=${valContractBalanceAfter}`);
      expect((valContractBalanceAfter.sub(valContractBalanceBefore))).to.be.equal(-100);
      expect((ownerBalanceAfter.sub(ownerBalanceBefore))).to.be.equal(+100);

      await expect(tx)
        .to.emit(valContract_, "NodeStatusChanged")
        .withArgs(node1Wallet_.address, NodeStatus.Unstaked, 0);
    }

  })
});


