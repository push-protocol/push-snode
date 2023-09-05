import {time, loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {anyValue} from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect} from "chai";
import {assert} from "chai";
import {ethers} from "hardhat";
import {Contract, ContractTransaction} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BitUtil} from "./uitlz/bitUtil";
import {TestHelper as t} from "./TestHelper";
import {CollectionUtil} from "./uitlz/collectionUtil";
import {NodeStatus} from "./ValidatorHelper";

let debug = console.log;
let ct: StorageContract & Contract;
let ctAsOwner: StorageContract & Contract;

let nodes = [null];
for (let i = 1; i <= 254; i++) {
  nodes.push('0x' + i.toString().padStart(40, '0'));
}


interface StorageContract {

  nodeAddrList(pos: number): Promise<string>;

  mapNodeIdToAddr(nodeId: number): Promise<string>;

  nodeIdList(pos: number): Promise<number>;

  rf(): Promise<number>;

  getNodeShardsByAddr(addr: string): Promise<number>;

  nodeCount(): Promise<number>;

  addNode(addr: string): Promise<ContractTransaction>;

  removeNode(addr: string): Promise<ContractTransaction>;

  SHARD_COUNT(): Promise<number>;

  // admin functions

  overrideRf(number): Promise<ContractTransaction>;

  shuffle(): Promise<ContractTransaction>;

}

type TypedStorageContract = StorageContract & Contract;

class DeployInfo {
  storageCt: TypedStorageContract;
  owner: SignerWithAddress;
}

async function state1(): Promise<DeployInfo> {
  debug('building snapshot');
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount, thirdAccount] = await ethers.getSigners();

  let protocolVersion = 1;
  let validatorContract = '0x' + '0'.repeat(40);
  let rfTarget = 5;
  const factory = await ethers.getContractFactory("StorageV2");
  const proxyCt: TypedStorageContract = <TypedStorageContract>await upgrades.deployProxy(factory,
    [protocolVersion, validatorContract, rfTarget],
    {kind: "uups"});
  await proxyCt.deployed();
  debug(`deployed proxy: ${proxyCt.address}`);
  let implCt = await upgrades.erc1967.getImplementationAddress(proxyCt.address);
  debug(`deployed impl: ${implCt}`);

  // const storageCtFactory = await ethers.getContractFactory("StorageV1");
  // const storageCt = await storageCtFactory.deploy();
  return {storageCt: proxyCt, owner};
}


// read everything from the contract state to ease the testing
class State {
  rf: number;
  nodeList = new Set<string>();
  map: Map<string, Set<number>> = new Map();
  shardCount: number;

  public static async readFromEvm(): Promise<State> {
    let s = new State();
    s.rf = await ct.rf();
    s.shardCount = await ct.SHARD_COUNT();
    let nodeCount = await ct.nodeCount();
    for (let i = 0; i < nodeCount; i++) {
      let nodeId = await ct.nodeIdList(i);
      let addr = await ct.mapNodeIdToAddr(nodeId);
      let shardsBitSet = await ct.getNodeShardsByAddr(addr);
      let shardsIntArr = BitUtil.bitsToPositions(shardsBitSet);
      let shardsIntSet = CollectionUtil.arrayToSet(shardsIntArr);
      s.map.set(addr, shardsIntSet);
      s.nodeList.add(addr);
      const nodeIdFixed = (nodeId + '').padStart(3, ' ');
      console.log(`node`, nodeIdFixed, addr, CollectionUtil.setToArray(shardsIntSet));
    }
    return s;
  }

  checkRf(e: number) {
    console.log('assert rf', e);
    assert.equal(this.rf, e);
  }

  checkNodeCount(e: number) {
    console.log('assert nodeCount', e);
    assert.equal(this.nodeList.size, e);
  }

  assertMapping(addr: string, shardsAssigned: number[]) {
    assert.deepEqual(CollectionUtil.setToArray(this.map.get(addr)), shardsAssigned);
    console.log(`assert ${addr} has good mapping`);
  }

  checkDistribution(expectedRf: number = -1) {
    let minSize = 100000000000;
    let maxSize = 0;
    for (const [node, shards] of this.map) {
      minSize = Math.min(minSize, shards.size);
      maxSize = Math.max(maxSize, shards.size);
    }
    const delta = maxSize - minSize;
    console.log('assert maxdistance', delta)
    assert.isTrue(delta <= 1, `maxdistance > 1`);
    this.assertCorrectReplicationFactor(expectedRf);
  }

  assertCorrectReplicationFactor(expectedRf: number = -1) {
    console.log('assert rf', expectedRf);
    let shardToCnt = new Map<number, number>;
    for (const [nodeId, shards] of this.map) {
      for (const sh of shards) {
        let counter = shardToCnt.get(sh);
        counter = counter == null ? 1 : ++counter;
        shardToCnt.set(sh, counter);
      }
    }
    if (this.nodeList.size == 0) {
      return;
    }
    if (expectedRf == -1) {
      expectedRf = this.rf;
    }
    for (let sh = 0; sh < this.shardCount; sh++) {
      const actualCnt = shardToCnt.get(sh);
      if (actualCnt != expectedRf) {
        throw new Error(`incorrect number of shards for shard: ${sh} , `
          + `got ${actualCnt} expected ${this.rf}`);
      }
    }
  }
}

async function assertRf(e: number) {
  const actualRf = await ct.rf();
  console.log('assert actual rf', e);
  assert.equal(actualRf, e);
}

async function assertNodeListLength(e: number) {
  const nodeListLength = await ct.nodeCount();
  console.log('assert actual nodeListLength', nodeListLength);
  assert.equal(nodeListLength, e);
}

async function beforeEachInit() {
  const state = await loadFixture(state1);
  ct = <StorageContract & Contract>state.storageCt;
  ctAsOwner = <StorageContract & Contract>ct.connect(state.owner);
  expect(ct.address).to.be.properAddress;
}

describe("StorageTestAutoRf", function () {

  beforeEach(beforeEachInit)

  it('test0', async () => {
    let s = await State.readFromEvm();
    s.checkRf(0);
    assert.equal(await ct.nodeCount(), 0);
    assert.equal(await ct.SHARD_COUNT(), 32);
  })

  it("test1", async function () {
    console.log(nodes[1]);
    let tx = await ct.addNode(nodes[1]);
    await expect(tx).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[1]]);
    let s = await State.readFromEvm();
    s.checkNodeCount(1);
    s.checkRf(1);
    s.assertMapping(nodes[1],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31]);
  });


  it('test2', async () => {
    {
      let t1 = await ct.addNode(nodes[1]);
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[1]]);
      let s = await State.readFromEvm();
      s.checkRf(1);
      s.checkNodeCount(1);
      s.assertMapping(nodes[1],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
          10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
          20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
          30, 31]);
    }
    {
      let t1 = await ct.addNode(nodes[2]);
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[2]]);
      let s = await State.readFromEvm();
      s.checkRf(2);
      s.checkNodeCount(2);
      s.assertMapping(nodes[2],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
          10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
          20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
          30, 31]);
    }
  });

  it('test_5to6', async () => {
    let nodeCount = 0;
    for (let nodeId = 1; nodeId <= 6; nodeId++) {
      if (nodeId === 6) {
        console.log('\n'.repeat(5) + '='.repeat(15))
      }
      let tx = await ct.addNode(nodes[nodeId]);
      await t.confirmTransaction(tx);
      nodeCount++;
    }
    let s = await State.readFromEvm();
    s.checkRf(5);
    s.checkNodeCount(6);
    s.checkDistribution();

  });

  it('test_1to5_6to10', async () => {
    let s = await State.readFromEvm();
    s.checkRf(0);
    s.checkNodeCount(0);
    s.checkDistribution();

    let nodeCount = 0;
    // add 5 nodes , every should get the same shards
    // because replication factor increments also to 5
    for (let nodeId = 1; nodeId <= 5; nodeId++) {
      // add 1 node
      const addr = nodes[nodeId];
      console.log('test adds ', addr);
      let t1 = await ct.addNode(addr);
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([addr]);
      nodeCount++;
      // check that replication count incremented
      // check that event affected only this one node
      // check that all nodes up to this one have the same mapping to all shards
      let s = await State.readFromEvm();
      s.checkRf(nodeCount);
      s.checkNodeCount(nodeCount);
      s.checkDistribution();
      for (let i = 1; i <= nodeId; i++) {
        s.assertMapping(nodes[i],
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
            10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
            30, 31]);
      }
    }

    // we have 5 nodes
    let s1 = await State.readFromEvm();
    s1.checkRf(5);
    s1.checkNodeCount(5);

    // add 6 to 10
    for (let nodeId = 6; nodeId <= 10; nodeId++) {
      {
        let t1 = await ct.addNode(nodes[nodeId]);
        await t.confirmTransaction(t1);
        nodeCount++;
        let s = await State.readFromEvm();
        s.checkRf(5);
        s.checkNodeCount(nodeCount);
        s.checkDistribution();
      }
    }
    // END TEST
  });

  it('test_add2_remove2', async () => {
    let nodeCount = 0;
    for (let nodeId = 1; nodeId <= 2; nodeId++) {
      const addr = nodes[nodeId];
      console.log('test adds ', addr);
      let t1 = await ct.addNode(addr);
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[nodeId]]);
      nodeCount++;
      let s = await State.readFromEvm();
      s.checkRf(nodeCount);
      s.checkNodeCount(nodeCount);
      s.checkDistribution();
    }
    {
      let t1 = ct.removeNode(nodes[1]);
      nodeCount--;
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[1]]); // raised by delete
      let s = await State.readFromEvm();
      s.checkRf(nodeCount);
      s.checkNodeCount(nodeCount);
      s.checkDistribution();
    }
    {
      let t1 = ct.removeNode(nodes[2]);
      nodeCount--;
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[2]]); // raised by delete
      let s = await State.readFromEvm();
      s.checkRf(nodeCount);
      s.checkNodeCount(nodeCount);
      s.checkDistribution();
    }
  })

});


describe("StorageTestNoAutoRf", function () {

  beforeEach(beforeEachInit)

  it('rf2_test_add2_remove2', async () => {
    let nodeCount = 0;
    {
      let nodeId = 1;
      const addr = nodes[nodeId];
      console.log('test adds ', addr);
      let t1 = await ct.addNode(addr);
      nodeCount++;
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([addr]);
      await ctAsOwner.overrideRf(1); // manually set RF
      let s = await State.readFromEvm();
      s.checkRf(1);
      s.checkNodeCount(1);
      s.checkDistribution();
    }
    {
      let nodeId = 2;
      const addr = nodes[nodeId];
      console.log('test adds ', addr);
      let t1 = await ct.addNode(addr); // rf is 1
      nodeCount++;
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[1], nodes[2]]);
      await ctAsOwner.overrideRf(2); // manually set RF
      await ctAsOwner.shuffle();
      // await t.confirmTransaction(t1);
      let s = await State.readFromEvm();
      s.checkRf(2);
      s.checkNodeCount(2);
      s.checkDistribution();
    }

    {
      let t1 = ct.removeNode(nodes[1]);
      nodeCount--;
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[1]]); // raised by delete
      let s = await State.readFromEvm();
      s.checkRf(2); // RF doesn't decrement since it's manual
      s.checkNodeCount(nodeCount);
      s.checkDistribution(1);
    }
    {
      let t1 = ct.removeNode(nodes[2]);
      nodeCount--;
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodes[2]]); // raised by delete
      let s = await State.readFromEvm();
      s.checkRf(2); // RF doesn't decrement since it's manual
      s.checkNodeCount(nodeCount);
      s.checkDistribution(0);
    }
  });


  it('rf2_test20nodes_2join_1leave', async () => {
    let nodeCount = 0;
    for (let nodeId = 1; nodeId <= 3; nodeId++) {
      const addr = nodes[nodeId];
      let t1 = await ct.addNode(addr);
      if (nodeId == 2) {
        await ctAsOwner.overrideRf(2); // manually set RF
        await ctAsOwner.shuffle();
      }
      nodeCount++;
      await t.confirmTransaction(t1);
      let s = await State.readFromEvm();
      s.checkNodeCount(nodeCount);
      if (nodeId >= 2) {
        s.checkDistribution();
      }
    }
    let s = await State.readFromEvm();
    s.checkRf(2);
    s.checkNodeCount(nodeCount);
    s.checkDistribution(2);
    for (let nodeId = 4; nodeId <= 20; nodeId++) {
      console.log('-'.repeat(20), 'adding', nodeId);
      if (nodeId % 3 === 0) {
        {
          const addr = nodes[nodeId];
          let t1 = await ct.addNode(addr);
          nodeCount++;
          await t.confirmTransaction(t1);
        }
        {
          let t1 = await ct.removeNode(nodes[nodeId - 1]);
          nodeCount--;
          await t.confirmTransaction(t1);
        }
      } else {
        {
          const addr = nodes[nodeId];
          let t1 = await ct.addNode(addr);
          nodeCount++;
          await t.confirmTransaction(t1);
        }
      }
      let s = await State.readFromEvm();
      s.checkRf(2);
      s.checkNodeCount(nodeCount);
      s.checkDistribution(2);
    }
  })
});


describe('StorageTestBig', function () {

  beforeEach(beforeEachInit);

  let nodeCount = 0;

  async function addNode(nodeId: number) {
    {
      const addr = nodes[nodeId];
      assert.isTrue(addr != null);
      let t1 = await ct.addNode(addr);
      nodeCount++;
      await t.confirmTransaction(t1);
    }
  }

  async function removeNode(nodeId: number) {
    const addr = nodes[nodeId];
    assert.isTrue(addr != null);
    let t1 = await ct.removeNode(addr);
    nodeCount--;
    await t.confirmTransaction(t1);
  }

  async function setRfAndShuffle(rf: number) {
    await ctAsOwner.overrideRf(rf);
    await ctAsOwner.shuffle();
  }

  it('test_rfAuto_n1to50', async () => {
    for (let nodeCount = 1; nodeCount <= 50; nodeCount++) {
      await addNode(nodeCount);
      let s = await State.readFromEvm();
      s.checkNodeCount(nodeCount);
      s.checkDistribution(Math.min(nodeCount, 5));
    }
  }).timeout(600000);

  it('test_rfManual_n1to50', async () => {
    for (let nodeCount = 1; nodeCount <= 50; nodeCount++) {
      await addNode(nodeCount);
      if (nodeCount == 5) {
        await setRfAndShuffle(5); // stop auto rf grow on 5
      }
      let s = await State.readFromEvm();
      s.checkNodeCount(nodeCount);
      s.checkDistribution(Math.min(nodeCount, 5));
    }
  }).timeout(600000);

  it('test_rfAll_nAll', async () => {
    // await ctAsOwner.overrideRf(2); // now replication factor never changes

    const NODES_TO_TRY = 10;
    const RF_TO_TRY = 10;

    for (let shardCount of [32]) { // always 32 in the contract
      console.log('%s testing shardcount: %d', '-'.repeat(30), shardCount);

      // nodes = 1..40 , rf = 1..10 10..1
      for (let nodeCount = 1; nodeCount <= NODES_TO_TRY; nodeCount++) {
        await addNode(nodeCount);
        for (let rf = 1; rf <= Math.min(nodeCount, RF_TO_TRY); rf++) {
          console.log('%s testing shardcount: %d nodecount: %d rf: %d', '-'.repeat(30), shardCount, nodeCount, rf);
          if (nodeCount >= rf) {
            await setRfAndShuffle(rf);
          }
        }
        for (let rf = Math.min(nodeCount, RF_TO_TRY); rf >= 1; rf--) {
          console.log('%s testing shardcount: %d nodecount: %d rf: %d', '-'.repeat(30), shardCount, nodeCount, rf);
          if (nodeCount >= rf) {
            await setRfAndShuffle(rf);
          }
        }
      }

      // nodes = 40..1 , rf = 1..10 10..1
      for (let nodeCount = NODES_TO_TRY; nodeCount >= 1; nodeCount--) {
        await removeNode(nodeCount);
        for (let rf = 1; rf <= Math.min(nodeCount, RF_TO_TRY); rf++) {
          console.log('%s testing shardcount: %d nodecount: %d rf: %d', '-'.repeat(30), shardCount, nodeCount, rf);
          if (nodeCount >= rf) {
            await setRfAndShuffle(rf);
          }
        }
        for (let rf = Math.min(nodeCount, RF_TO_TRY); rf >= 1; rf--) {
          console.log('%s testing shardcount: %d nodecount: %d rf: %d', '-'.repeat(30), shardCount, nodeCount, rf);
          if (nodeCount >= rf) {
            await setRfAndShuffle(rf);
          }
        }
      }
    }
  }).timeout(600000);
});