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
import {NodeStatus} from "./ValidatorContractHelper";

let debug = console.log;


class DeployInfo {
  storageCt: Contract;
  owner: SignerWithAddress;
}

async function state1(): Promise<DeployInfo> {
  debug('building snapshot');
  // Contracts are deployed using the first signer/account by default
  const [owner, otherAccount, thirdAccount] = await ethers.getSigners();

  const storageCtFactory = await ethers.getContractFactory("StorageV1");
  const storageCt = await storageCtFactory.deploy();

  return {storageCt, owner};
}

let ct: StorageContract & Contract;

/*assertCorrectReplicationFactor() {
  let shardToCnt = new Map<number, number>;
  for (const [nodeId, shards] of this.map) {
    for (const sh of shards) {
      let counter = shardToCnt.get(sh);
      counter = counter == null ? 1 : ++counter;
      shardToCnt.set(sh, counter);
    }
  }
  if (this.nodeCount == 0) {
    return;
  }
  for (let sh = 1; sh <= this.shardCount; sh++) {
    if (shardToCnt.get(sh) != this.rf) {
      throw new Error(`not enough shards for ${sh}`);
    }
  }
}*/

interface StorageContract {

  nodeAddrList(pos: number): Promise<string>;

  rf(): Promise<number>;

  getNodeShardsByAddr(addr: string): Promise<number>;

  nodeCount(): Promise<number>;

  addNodeAndStake(addr: string): Promise<ContractTransaction>;

  SHARD_COUNT(): Promise<number>;
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
      let addr = await ct.nodeAddrList(i);
      let shardsBitSet = await ct.getNodeShardsByAddr(addr);
      let shardsIntArr = BitUtil.bitsToPositions(shardsBitSet);
      let shardsIntSet = CollectionUtil.arrayToSet(shardsIntArr);
      s.map.set(addr, shardsIntSet);
      s.nodeList.add(addr);
      console.log(addr, '->', CollectionUtil.setToArray(shardsIntSet));
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

  checkDistribution() {
    let minSize = 100000000000;
    let maxSize = 0;
    for (const [node, shards] of this.map) {
      minSize = Math.min(minSize, shards.size);
      maxSize = Math.max(maxSize, shards.size);
    }
    const delta = maxSize - minSize;
    console.log('assert maxdistance', delta)
    assert.isTrue(delta <= 1, `maxdistance > 1`);
    this.assertCorrectReplicationFactor();
  }

  assertCorrectReplicationFactor() {
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
    for (let sh = 0; sh < this.shardCount; sh++) {
      const actualCnt = shardToCnt.get(sh);
      if (actualCnt != this.rf) {
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


/*


*/


async function assertMapping(addr: string, shardsAssigned: number[]) {
  const nodeShardsByAddr = await ct.getNodeShardsByAddr(addr);
  assert.deepEqual(BitUtil.bitsToPositions(nodeShardsByAddr), shardsAssigned);
  console.log(`assert ${addr} has good mapping`);
}

let nodes = [null];
for (let i = 1; i <= 100; i++) {
  nodes.push('0x' + i.toString().padStart(40, '0'));
}


describe("StorageTest", function () {

  beforeEach(async () => {
    const state = await loadFixture(state1);
    ct = <StorageContract & Contract>state.storageCt;
    expect(ct.address).to.be.properAddress;
  })

  it("TestBasic", async function () {
    console.log(nodes[1]);
    let tx = await ct.addNodeAndStake(nodes[1]);
    await expect(tx).to.emit(ct, "SNodeMappingChanged").withArgs([1]);
    let s = await State.readFromEvm();
    s.checkNodeCount(1);
    s.checkRf(1);
  });

  it('test0node', async () => {
    let s = await State.readFromEvm();
    s.checkRf(1);
    assert.equal(await ct.nodeCount(), 0);
    assert.equal(await ct.SHARD_COUNT(), 32);
  })

  it('test1node-', async () => {
    let t1 = await ct.addNodeAndStake(nodes[1]);
    await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([1]);
    let s = await State.readFromEvm();
    s.checkRf(1);
    s.checkNodeCount(1);
    s.assertMapping(nodes[1],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31]);
  })

  it('test_1to5_6to10', async () => {
    let s = await State.readFromEvm();
    s.checkRf(1);
    s.checkNodeCount(0);
    s.checkDistribution();

    let nodeCount = 0;
    // add 5 nodes , every should get the same shards
    // because replication factor increments also to 5
    for (let nodeId = 1; nodeId <= 5; nodeId++) {
      // add 1 node
      const addr = nodes[nodeId];
      console.log('test adds ', addr);
      let t1 = await ct.addNodeAndStake(addr);
      await expect(t1).to.emit(ct, "SNodeMappingChanged").withArgs([nodeId]);
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
    await assertRf(5);
    await assertNodeListLength(5);

    // add 6 to 10
    for (let nodeId = 6; nodeId <= 10; nodeId++) {
      {
        let t1 = await ct.addNodeAndStake(nodes[nodeId]);
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


});