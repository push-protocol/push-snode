import {time, loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {anyValue} from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import {expect} from "chai";
import {assert} from "chai";
import {ethers} from "hardhat";
import {Contract} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BitUtil} from "./uitlz/bitUtil";

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

let storageCt;

async function assertRf(e: number) {
  const actualRf = await storageCt.rf();
  console.log('assert actual rf', e);
  assert.equal(actualRf, e);
}

async function assertNodeListLength(e: number) {
  const nodeListLength = await storageCt.nodeListLength();
  console.log('assert actual nodeListLength', nodeListLength);
  assert.equal(nodeListLength, e);
}

async function assertMapping(addr: string, shardsAssigned: number[]) {
  assert.deepEqual(
    BitUtil.bitsToPositions(
      await storageCt.getNodeShardsByAddr(addr)),
    shardsAssigned);
  console.log(`assert ${addr} has good mapping`);
}

let nodes = [null];
for (let i = 1; i <= 100; i++) {
  nodes.push('0x' + i.toString().padStart(40, '0'));
}


describe("StorageTest", function () {

  beforeEach(async () => {
    const state = await loadFixture(state1);
    storageCt = state.storageCt;
    expect(storageCt.address).to.be.properAddress;
  })

  it("TestBasic", async function () {
    console.log(nodes[1]);
    let t1 = await storageCt.addNodeAndStake(nodes[1]);
    await expect(t1).to.emit(storageCt, "SNodeMappingChanged").withArgs([1]);

    let nodeCount = await storageCt.nodeListLength();
    debug('node count is ', nodeCount);
    assert.equal(nodeCount, 1);

    const n1shards: number = await storageCt.getNodeShardsByAddr(nodes[1]);
    debug('node shards:', n1shards.toString(2));
    debug('node shards:', BitUtil.bitsToPositions(n1shards));

    debug('finished test1.');

  });

  it('test0node', async () => {
    await assertRf(1);
    assert.equal(await storageCt.nodeListLength(), 0);
    assert.equal(await storageCt.SHARD_COUNT(), 32);
  })

  it('test1node', async () => {
    let t1 = await storageCt.addNodeAndStake(nodes[1]);
    await expect(t1).to.emit(storageCt, "SNodeMappingChanged").withArgs([1]);
    assertMapping(nodes[1],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31]);
  })

  it('test1node_add234', async () => {
    await assertRf(1);
    await assertNodeListLength(0);
    let nodeCount = 0;
    for (let nodeId = 1; nodeId <= 3; nodeId++) {
      // add 1 node
      const addr = nodes[nodeId];
      console.log('test adds ', addr);
      let t1 = await storageCt.addNodeAndStake(addr);
      await expect(t1).to.emit(storageCt, "SNodeMappingChanged").withArgs([nodeId]);
      nodeCount++;
      // check that replication count incremented
      await assertRf(nodeCount);
      await assertNodeListLength(nodeCount);
      // check that event affected only this one node

      // check that all nodes up to this one have the same mapping to all shards
      for (let i = 1; i <= nodeId; i++) {
        await assertMapping(nodes[i],
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
            10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
            30, 31]);
      }

      // we have 5 nodes
/*      {
        let t1 = await storageCt.addNodeAndStake(nodes[6]);
        await assertRf(5);
        for (let i = 1; i <= nodeId; i++) {
          console.log(BitUtil.bitsToPositions(await storageCt.getNodeShardsByAddr(nodes[i])));
        }

      }*/
    }

    /*
        let t2 = await storageCt.addNodeAndStake(nodes[2]);
        await assertRf(2);
        await expect(t2).to.emit(storageCt, "SNodeMappingChanged").withArgs([2]);
        await assertMapping(nodes[1],
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
            10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
            30, 31]);
        await assertMapping(nodes[2],
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
            10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
            30, 31]);*/
  })
});