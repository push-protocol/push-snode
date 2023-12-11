// noinspection JSUnusedGlobalSymbols

import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {assert, expect} from "chai";
import hre, {ethers} from "hardhat";
import {PushToken, StorageV1, ValidatorV1} from "../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TestHelper as th} from "./uitlz/TestHelper";
import {EthSig2, NodeStatus, VoteDataS, VoteDataV} from "./ValidatorHelper";
import {BitUtil} from "./uitlz/bitUtil";
import {DeployerUtil, NodeType} from "../src/DeployerUtil";
import {BigNumber} from "ethers";

let log = console.log;


// VARIABLES FOR TESTS
let valCt: ValidatorV1;
let pushCt: PushToken;
let storeCt: StorageV1;
let owner: SignerWithAddress;
let vnodes: SignerWithAddress[];
let snodes: SignerWithAddress[];
let acc1: SignerWithAddress;
let acc2: SignerWithAddress;
let vnode1: SignerWithAddress;
let vnode2: SignerWithAddress;
let snode1: SignerWithAddress;
let snode2: SignerWithAddress;

class DeployInfo {
  pushCt: PushToken;
  valCt: ValidatorV1;
  storeCt: StorageV1;
  signers: SignerWithAddress[];
}

async function initBlockchain(): Promise<DeployInfo> {
  log('building snapshot');

  // Contracts are deployed using the first signer/account by default
  const signers = await ethers.getSigners();
  const [owner_] = signers;

  const pushCt = await DeployerUtil.deployPushTokenFake(hre);
// todo SLASH_PERCENT 10 for tests, and 1 for PROD
  const valCt = await DeployerUtil.deployValidatorContract(hre, pushCt.address);

  const storeCt = await DeployerUtil.deployStorageContract(hre, valCt.address);
  await valCt.setStorageContract(storeCt.address);

  for (let s of signers) {
    await pushCt.mint(s.address, ethers.utils.parseEther("100"));
    await pushCt
      .connect(s)
      .approve(valCt.address, ethers.utils.parseEther("100"));//1000000000000000
  }
  return {pushCt, valCt, storeCt, signers};
}

async function beforeEachInit() {
  const di = await loadFixture(initBlockchain);
  pushCt = di.pushCt;
  valCt = di.valCt;
  storeCt = di.storeCt;
  owner = di.signers[0];

  vnodes = di.signers.slice(3, 11);
  vnode1 = vnodes[0];
  vnode2 = vnodes[1];

  snodes = di.signers.slice(11, 16);
  snode1 = snodes[0];
  snode2 = snodes[1];

  let accs = di.signers.slice(16, 21);
  acc1 = accs[0];
  acc2 = accs[1];

}


describe("Valdator - ownership tests / vot", function () {

  beforeEach(beforeEachInit);

  it('transfer to a different owner / tdi', async function () {
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

describe("Validator - register nodes tests / vrn", function () {

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
    assert.equal((await valCt.getVNodesLength()).toNumber(), 2);
  })
});


describe("Storage", function () {

  beforeEach(beforeEachInit);

  it("add storage node to both Validator and Storage contracts / asn1", async function () {
    // register node1, node2
    const allShards = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
      30, 31];
    {
      // add snode1 with owner acc1
      log('valCt: ', valCt.address);
      log('valCt owner: ', owner.address);
      log('snode1 owner1: ', acc1.address);
      log('snode1: ', snode1.address);
      let t1 = await valCt.connect(acc1)
        .registerNodeAndStake(100, NodeType.SNode, "", snode1.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(acc1.address, snode1.address, NodeType.SNode, 100, "");

      let nodeInfo = await valCt.getNodeInfo(snode1.address);
      expect(nodeInfo.status).to.be.equal(0);

      const bitmask = await storeCt.getNodeShardsByAddr(snode1.address);
      assert.deepEqual(BitUtil.bitsToPositions(bitmask), allShards);
    }

    {
      // add snode2 with owner acc2
      log('valCt: ', valCt.address);
      log('valCt owner: ', owner.address);
      log('snode1 owner2: ', acc2.address);
      log('snode2: ', snode2.address);
      let t1 = await valCt.connect(acc2)
        .registerNodeAndStake(200, NodeType.SNode, "", snode2.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(acc2.address, snode2.address, NodeType.SNode, 200, "");

      let nodeInfo = await valCt.getNodeInfo(snode2.address);
      expect(nodeInfo.status).to.be.equal(0);

      const bitmask = await storeCt.getNodeShardsByAddr(snode2.address);
      assert.deepEqual(BitUtil.bitsToPositions(bitmask), allShards);
    }
    // total funds locked = sum of both nodes stakes,
    // all nodes are visible in all contracts
    expect(await pushCt.balanceOf(valCt.address)).to.be.equal(300);
    assert.deepEqual(await valCt.getSNodes(), [snode1.address, snode2.address])
    assert.deepEqual(await storeCt.getNodeAddresses(), [snode1.address, snode2.address])


    {
      // remove node1
      const t1 = await valCt.connect(acc1).unstakeNode(snode1.address);
      await th.confirmTransaction(t1);
      const t2 = await valCt.connect(acc1).unstakeNode(snode1.address); // try unstake 2nd time
      expect(t2).to.be.reverted;
      const t3 = valCt.connect(acc2).unstakeNode(snode1.address); // try unstake: not a node owner
      expect(t3).to.be.reverted;
    }
    {
      // remove node2
      const t1 = await valCt.connect(acc2).unstakeNode(snode2.address);
      await th.confirmTransaction(t1);
      const t2 = valCt.connect(acc2).unstakeNode(snode2.address); // try unstake 2nd time
      expect(t2).to.be.reverted;
      const t3 = valCt.connect(acc1).unstakeNode(snode2.address); // try unstake: not a node owner
      expect(t3).to.be.reverted;
    }

  });


  describe("Validator - Test unstake / vtu", function () {

    beforeEach(beforeEachInit);

    it("register 1 node / unstake to bad address / unstake to owner address | unstake-test-1", async function () {
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
        await th.confirmTransaction(tx);

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
        await th.confirmTransaction(tx);

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


describe("Validator - node reports on other node / vnro", function () {

  beforeEach(beforeEachInit);

  it("Check smart contract signatures - cscs", async function () {
    let vd = new VoteDataV(1, '1111', '0x' + "AA".repeat(20));
    const packed = VoteDataV.encode(vd);
    console.log('vote data packed: ', packed);

    const sig1 = await EthSig2.signOffline(vnode1, packed);
    console.log('signer is', vnode1.address);
    console.log('signature: ', sig1);
    const valid = await EthSig2.checkOffline(packed, sig1, vnode1.address);
    console.log('signature is valid: ', valid);
    expect(valid).to.be.true;
  });

  it("Register 1 validator node and check events - val-reg-1", async function () {
    assert.equal(await valCt.valPerBlock(), 0);
    assert.equal(await valCt.valPerBlockTarget(), 5);
    {
      let t1 = await valCt.registerNodeAndStake(100, 0,
        "http://snode1:3000", vnode1.address);
      await expect(t1).to.emit(valCt, "NodeAdded")
        .withArgs(owner.address, vnode1.address, 0, 100, "http://snode1:3000");
      await expect(t1).to.emit(valCt, "BlockParamsUpdated")
        .withArgs(1, 5);
      assert.equal(await valCt.valPerBlock(), 1);
      let nodeInfo = await valCt.getNodeInfo(vnode1.address);
      assert.equal(nodeInfo.status, 0);
    }

  });

  it("Register 6 storage nodes and unstake them :: reg-6s", async function () {
    let nodeType = NodeType.SNode;
    let nodeTokens = 100;
    // register nodes
    assert.equal(await valCt.valPerBlock(), 0);
    assert.equal(await valCt.valPerBlockTarget(), 5);
    for (let i = 0; i < 6; i++) {
      let t1 = await valCt.registerNodeAndStake(nodeTokens, nodeType,
        `http://snode${i}:3000`, vnodes[i].address);
      await th.confirmTransaction(t1);
    }
    assert.equal((await valCt.getSNodesLength()).toNumber(), 6);
    assert.equal((await pushCt.balanceOf(valCt.address)).toNumber(), 6 * nodeTokens);

    // unstake nodes
    for (let i = 0; i < 6; i++) {
      let t1 = await valCt.unstakeNode(vnodes[i].address);
      await th.confirmTransaction(t1);
    }
    assert.equal((await valCt.getSNodesLength()).toNumber(), 0);
    assert.equal((await pushCt.balanceOf(valCt.address)).toNumber(), 0);
  });


  it("Regster 6 validator nodes and unstake them :: reg-6v-unreg", async function () {
    let nodeType = NodeType.VNode;
    let nodeTokens = 100;
    // register nodes
    assert.equal(await valCt.valPerBlock(), 0);
    assert.equal(await valCt.valPerBlockTarget(), 5);
    for (let i = 0; i < 6; i++) {
      let t1 = await valCt.registerNodeAndStake(nodeTokens, nodeType,
        `http://snode${i}:3000`, vnodes[i].address);
      await th.confirmTransaction(t1);
    }
    assert.equal((await valCt.getVNodesLength()).toNumber(), 6);
    assert.equal(await valCt.valPerBlock(), 5); // peaks at 5, even for 6 nodes
    assert.equal(await valCt.valPerBlockTarget(), 5);
    assert.equal((await pushCt.balanceOf(valCt.address)).toNumber(), 6 * nodeTokens);
    // unstake nodes
    for (let i = 0; i < 6; i++) {
      let t1 = await valCt.unstakeNode(vnodes[i].address);
      await th.confirmTransaction(t1);
    }
    assert.equal((await valCt.getVNodesLength()).toNumber(), 0);
    assert.equal(await valCt.valPerBlock(), 0);
    assert.equal(await valCt.valPerBlockTarget(), 5);
    assert.equal((await pushCt.balanceOf(valCt.address)).toNumber(), 0);
  });


  it("Regster 3 validator nodes - 2 report on 1 :: v-reports-on-v", async function () {
    let nodeType = NodeType.VNode;
    let nodeTokens = 100;
    const v0 = vnodes[0];
    const v1 = vnodes[1];
    const v2 = vnodes[2];
    // register 3 nodes
    assert.equal(await valCt.valPerBlock(), 0);
    assert.equal(await valCt.valPerBlockTarget(), 5);
    for (let i = 0; i < 3; i++) {
      let t1 = await valCt.registerNodeAndStake(nodeTokens, nodeType,
        `http://snode${i}:3000`, vnodes[i].address);
      await th.confirmTransaction(t1);
    }

    {
      // v0,v1 report on v2 ; v0 calls reportNode
      const vote = VoteDataV.encode(new VoteDataV(1, '0x1111', v2.address));
      const sig0 = await EthSig2.signOffline(v0, vote);
      const sig1 = await EthSig2.signOffline(v1, vote);
      // 1st report
      let tx1 = await valCt.connect(v0).reportNode(NodeType.VNode, vote, [sig0, sig1]);

      const ni = await valCt.getNodeInfo(v2.address);

      assert.equal(ni.nodeTokens.toNumber(), 100);
      assert.equal(ni.status, NodeStatus.Reported);
      assert.equal(ni.counters.slashCounter, 0);
      assert.equal(ni.counters.reportCounter, 1);
      assert.deepEqual(ni.counters.reportedBy, [v0.address, v1.address]);
      assert.deepEqual(ni.counters.reportedKeys, []);

      await expect(tx1).to.emit(valCt, "NodeStatusChanged")
        .withArgs(v2.address, NodeStatus.Reported, BigNumber.from(100)); // 1% slash occured

      console.log('vote', vote);
      console.log('signature ', sig1);
      console.log('voter wallet is', vnode1.address);

      //duplicate report
      //same block id = reject
      let tx2 = valCt.connect(v0).reportNode(NodeType.VNode, vote, [sig0, sig1]);
      await th.expectRejct(tx2);
    }

    //2nd report (2 reports lead to slash; both n0,n1 get +5 tokens)
    {
      const vote = VoteDataV.encode(new VoteDataV(1, '0x2222', v2.address));
      const sig0 = await EthSig2.signOffline(v0, vote);
      const sig1 = await EthSig2.signOffline(v1, vote);
      let tx = await valCt.connect(v0).reportNode(NodeType.VNode, vote, [sig0, sig1]);
      // await th.printEvents(tx);
      await expect(tx).to.emit(valCt, "NodeStatusChanged")
        .withArgs(v2.address, NodeStatus.Slashed, BigNumber.from(90)); // 10% slash occured

      const ni2 = await valCt.getNodeInfo(v2.address);
      assert.equal(ni2.nodeTokens.toNumber(), 90);
      assert.equal(ni2.status, NodeStatus.Slashed);
      assert.equal(ni2.counters.slashCounter, 1);
      assert.equal(ni2.counters.reportCounter, 0);
      assert.deepEqual(ni2.counters.reportedBy, []);
      assert.deepEqual(ni2.counters.reportedKeys, []);

      const ni0 = await valCt.getNodeInfo(v0.address);
      assert.equal(ni0.nodeTokens.toNumber(), 105);

      const ni1 = await valCt.getNodeInfo(v1.address);
      assert.equal(ni1.nodeTokens.toNumber(), 105);
    }
  });


  it("2v report on 1s - v-reports-on-s", async function () {
    let nodeTokens = 100;
    const v0 = vnodes[0];
    const v1 = vnodes[1];
    const s0 = snodes[0];

    // register 3 validator nodes and 1 storage node
    for (let i = 0; i < 3; i++) {
      let t1 = await valCt.registerNodeAndStake(nodeTokens, NodeType.VNode,
        `http://snode${i}:3000`, vnodes[i].address);
      await th.confirmTransaction(t1);
    }
    {
      let t1 = await valCt.registerNodeAndStake(nodeTokens, NodeType.SNode,
        `http://snode${0}:3000`, snodes[0].address);
      await th.confirmTransaction(t1);
      const allShards = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31];
      const bitmask = await storeCt.getNodeShardsByAddr(s0.address);
      assert.deepEqual(BitUtil.bitsToPositions(bitmask), allShards);
    }

    // v0,v1 report on s0 ; v0 calls reportNode
    {
      const vote = VoteDataS.encode(new VoteDataS(2, '0x1111', s0.address, '0x9999'));
      const sig0 = await EthSig2.signOffline(v0, vote);
      const sig1 = await EthSig2.signOffline(v1, vote);
      // 1st report (works)
      let tx1 = await valCt.connect(v0).reportNode(NodeType.SNode, vote, [sig0, sig1]);

      const ni = await valCt.getNodeInfo(s0.address);
      assert.equal(ni.nodeTokens.toNumber(), 100);
      assert.equal(ni.status, NodeStatus.Reported);
      assert.equal(ni.counters.reportCounter, 1);
      assert.equal(ni.counters.slashCounter, 0);
      assert.deepEqual(ni.counters.reportedBy, [v0.address, v1.address]);
      assert.deepEqual(ni.counters.reportedKeys, [BigNumber.from('0x9999')]);

      await expect(tx1).to.emit(valCt, "NodeStatusChanged")
        .withArgs(s0.address, NodeStatus.Reported, BigNumber.from(100));

      console.log('vote', vote);
      console.log('signature ', sig1);
      console.log('voter wallet is', vnode1.address);

      //duplicate report

      //same block id = reject
      let tx2 = valCt.connect(v0).reportNode(NodeType.VNode, vote, [sig0, sig1]);
      await th.expectRejct(tx2);

      //different block, same skey = reject
      {
        const vote = VoteDataS.encode(new VoteDataS(2, '0x2222', s0.address, '0x9999'));
        const sig0 = await EthSig2.signOffline(v0, vote);
        const sig1 = await EthSig2.signOffline(v1, vote);
        let tx3 = valCt.connect(v0).reportNode(NodeType.VNode, vote, [sig0, sig1]);
        await th.expectRejct(tx3);
      }

      //2nd report (2 reports lead to slash; both n0,n1 get +5 tokens)
      {
        const vote = VoteDataS.encode(new VoteDataS(2, '0x2222', s0.address, '0x7777'));
        const sig0 = await EthSig2.signOffline(v0, vote);
        const sig1 = await EthSig2.signOffline(v1, vote);
        let tx = await valCt.connect(v0).reportNode(NodeType.SNode, vote, [sig0, sig1]);

        await expect(tx).to.emit(valCt, "NodeStatusChanged")
          .withArgs(s0.address, NodeStatus.Slashed, BigNumber.from(90)); // 10% slash occured

        const s0Info = await valCt.getNodeInfo(s0.address);
        assert.equal(s0Info.nodeTokens.toNumber(), 90);
        assert.equal(s0Info.status, NodeStatus.Slashed);
        assert.equal(s0Info.counters.slashCounter, 1);
        assert.equal(s0Info.counters.reportCounter, 0);
        assert.deepEqual(s0Info.counters.reportedBy, []);
        assert.deepEqual(s0Info.counters.reportedKeys,
          [BigNumber.from('0x9999'), BigNumber.from('0x7777')]);

        const ni0 = await valCt.getNodeInfo(v0.address);
        assert.equal(ni0.nodeTokens.toNumber(), 105);

        const ni1 = await valCt.getNodeInfo(v1.address);
        assert.equal(ni1.nodeTokens.toNumber(), 105);
      }
    }

  });

});
