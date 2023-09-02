//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

// todo remove
//import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/*


Goal:
support workflows like this

a node n1 joins a cluster, where every node is responsible for X vshards of data
we have M amount of vshards at the start (a predefined value)

the algorithm should ensure that
- a network maintains exactly [replication factor] amount of chunks in total on all nodes
- if a node joins/leaves the data is re-distributed
- replication factor can change - it goes up (no more than # of nodes in total) and goes down to 1
- re-distribution should affect the least amount of nodes possible
- re-distribution should favor grabbing fresh shards instead of old ones (assigned to the node a long time ago)
- difference between node with most vshards and least vshards should stay as close to ±1 as possible
- specifically for this contract: first N nodes will raise replication factor to RF_AUTOADJUST_LIMIT;

Re-sharding works like this:

maxshards = 6 , shard is a data range hosted by a node in the db,
rf = 1,  replication factor - how many copies should be there on different nodes,
nodes = 1, node count


shuffle() ---> shardCount=10 rf=1 nodeCount=1
map after:  Map(1) { 1 => Set(10) { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 } }

shuffle() ---> shardCount=10 rf=1 nodeCount=2
map after:  Map(2) {
  1 => Set(5) { 1, 2, 3, 4, 5 },
  2 => Set(5) { 10, 9, 8, 7, 6 }
}

shuffle() ---> shardCount=10 rf=2 nodeCount=3
map after:  Map(3) {
  1 => Set(7) { 1, 2, 3, 4, 5, 6, 8 },
  2 => Set(6) { 10, 9, 8, 7, 6, 5 },
  3 => Set(7) { 1, 2, 3, 4, 7, 9, 10 }
}


TODO reuse ids when nodes come and go (!)
     delete should be in nodeAddrList, nodeIdList
TODO ? use bitmaps for storing subscriptions
 use uint128 data type https://github.com/ethereum/solidity-examples/blob/master/src/bits/Bits.sol

*/
contract StorageV1 is Ownable2StepUpgradeable {
    // number of shards;
    // this value should not change after deploy
    // also this should match data type in mapNodeToShards (uint32/64/128/256)
    uint8 public constant SHARD_COUNT = 32;

    uint8 public constant SET_ON = 1; // for set we use uint8(1) as on, and uint8(0) as off
    uint8 public constant SET_OFF = 0;
    uint8 public constant NULL_SHARD = 255; // shard id that does not exists
    uint8 public constant MAX_NODE_ID = 254; // max nod

    // replication factor - how many copies of the same shard should be served by the network
    // dynamic,
    // ex: 1....20
    uint8 public rf = 1;
    // if 5 nodes join, we will set rf to 5 and then it won't grow
    uint8 public RF_AUTOADJUST_LIMIT = 5; // 0 to turn off

    // NODE DATA
    // node address -> nodeId (short address)
    // ex: 0xAAAAAAAAA -> 1
    mapping(address => uint8) public mapAddrToNodeId;
    address[] public nodeAddrList;
    // active nodeIds
    // nodeIds are 1-based
    // ex: [1,2,3]
    uint8[] public nodeIdList;

    // nodeId -> shards
    // shards are 0-based
    // ex: 1 -> 0,1,2
    mapping(uint8 => uint32) public mapNodeToShards;

    uint8 private unusedNodeId = 1;


    struct NodeDesc {
        uint8 node;
        uint8 shardCount;
    }

    event SNodeMappingChanged(uint8[] nodeList);

    // ADMIN FUNCTIONS 

    // allows to set replication factor manually; however this is limited by node count;
    function overrideRf(uint8 _rf) public onlyOwner {
        require(_rf <= nodeIdList.length, 'rf is limited by node count');
        rf = _rf;
        RF_AUTOADJUST_LIMIT = 0;
    }

    // allows to set
    function setNodeShardsByAddr(address _nodeAddress, uint32 bitmap) public onlyOwner {
        uint8 node = mapAddrToNodeId[_nodeAddress];
        require(node > 0, 'node address is not registered');
        mapNodeToShards[node] = bitmap;
    }

    function shuffle() public onlyOwner returns (uint8) {
        return _shuffle();
    }

    // END ADMIN FUNCTIONS

    function getNodeShardsByAddr(address _nodeAddress) public view returns (uint32) {
        uint8 node = mapAddrToNodeId[_nodeAddress];
        require(node > 0, 'no such node');
        uint32 result = mapNodeToShards[node];
//        console.log(node, _nodeAddress, ' mapped to ', result);
        return result;
    }

    function nodeCount() public view returns (uint8) {
        return uint8(nodeIdList.length);
    }

    function bit(uint32 self, uint8 index) internal pure returns (uint8) {
        return uint8(self >> index & 1);
    }

    function setBit(uint32 self, uint8 index) internal pure returns (uint32) {
        return self | uint32(1) << index;
    }

    // todo add staking (or merge with Validator code)
    function addNodeAndStake(address nodeAddress) public returns (uint8) {
//        console.log('addNodeAndStake', nodeAddress);
        require(mapAddrToNodeId[nodeAddress] == 0, 'address is already registered');
        require(unusedNodeId > 0, 'nodeId > 0');
        nodeIdList.push(unusedNodeId);
        nodeAddrList.push(nodeAddress);
        // add more copies of the data if the network can handle it, unless we get enough
        if (rf < RF_AUTOADJUST_LIMIT && rf < nodeIdList.length) {
            rf++;
//            console.log('rf is now', rf);
        }
        mapAddrToNodeId[nodeAddress] = unusedNodeId;
        _shuffle();
//        console.log('addNodeAndStake finished');
        return unusedNodeId++;
    }

    function removeNode(address nodeAddress) public {
        uint8 nodeId = mapAddrToNodeId[nodeAddress];
        if (nodeId == 0) {
            revert('no address found');
        }
        if (nodeIdList.length == 0) {
            // mapping exists, but node has no short id
            delete mapAddrToNodeId[nodeAddress];
            revert('no node id found');
        }
        // valid nodeId ; filter it out; don't shrink the storage array because it's expensive
        nodeIdList[nodeId] = 0;
    }

    function packShardsToBitmap(uint8[SHARD_COUNT][] memory _nodeShardsSet, uint8 nodeId) internal view returns (uint32) {
        uint32 result;
        uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[nodeId];
        for (uint8 shard = 0; shard < SHARD_COUNT; shard++) {
            if (shardSet[shard] == SET_ON) {
                result = setBit(result, shard);
            }
        }
//        console.log('packShardsToBitmap', nodeId, '->', result);
        return result;
    }

    function unpackBitmapToShards(uint32 bitmap, uint8[SHARD_COUNT][] memory _nodeShardsSet, uint8 nodeId) internal view {
//        console.log('unpacking', nodeId,'value', bitmap);
        uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[nodeId];
        for (uint8 shard = 0; shard < SHARD_COUNT; shard++) {
            shardSet[shard] = bit(bitmap, shard) == 1 ? SET_ON : SET_OFF;
        }
    }

    function distributeUnused(uint8[] memory _unusedArr,
        uint8[] memory _nodeList,
        uint8[SHARD_COUNT][] memory _nodeShardsSet,
        uint8[] memory _nodeModifiedSet,
        bool _stopOnAvg,
        uint8 _avgPerNode
    ) internal {
        // 1 take unused, offer it only to poor
        NodeDesc[] memory poorList = buildNodeDesc(_nodeList, _nodeShardsSet);
        for (uint i = 0; i < _unusedArr.length; i++) {
            uint8 shard = _unusedArr[i];
            if (shard == NULL_SHARD) {
                continue;
            }
            // get all nodes from poor to rich
            for (uint j = 0; j < poorList.length; j++) {
                NodeDesc memory _poor = poorList[j];
                if (_stopOnAvg && _poor.shardCount >= _avgPerNode) {
                    continue;
                }
                require(_poor.node != 0);
                sortNodesAndSize(poorList);
                uint8[SHARD_COUNT] memory poorShardsSet = _nodeShardsSet[_poor.node];
                if (poorShardsSet[shard] == SET_OFF) {
                    _unusedArr[i] = NULL_SHARD;

                    poorShardsSet[shard] = SET_ON;
                    _poor.shardCount++;
                    _nodeModifiedSet[_poor.node]++;
                    // todo REMOVE
//                    console.log(shard, ': unused ->', _poor.node);

                    break;
                }
            }
        }
    }

    function sort(NodeDesc[] memory _arr, int _left, int _right) internal {
        int i = _left;
        int j = _right;
        if (i == j) return;
        NodeDesc memory pivot = _arr[uint(_left + (_right - _left) / 2)];
        while (i <= j) {
            while (_arr[uint(i)].shardCount < pivot.shardCount) i++;
            while (pivot.shardCount < _arr[uint(j)].shardCount) j--;
            if (i <= j) {
                (_arr[uint(i)], _arr[uint(j)]) = (_arr[uint(j)], _arr[uint(i)]);
                i++;
                j--;
            }
        }
        if (_left < j) sort(_arr, _left, j);
        if (i < _right) sort(_arr, i, _right);
    }

    function sortNodesAndSize(NodeDesc[] memory _arr) internal {
        sort(_arr, 0, int(_arr.length - 1));
    }

    function resortOneItem(NodeDesc[] memory _arr, uint8 pos, bool increment) internal {
        uint8 target;
        if (increment) {
            target = pos + 1;
            while (target <= _arr.length - 1 && _arr[pos].shardCount > _arr[target].shardCount) target++;
        } else {
            target = pos - 1;
            while (target >=0 && _arr[pos].shardCount < _arr[target].shardCount) target--;
        }
        NodeDesc memory tmp = _arr[target];
        _arr[target] = _arr[pos];
        _arr[pos] = tmp;
        // todo remove
        for (uint i = 1; i < _arr.length; i++) {
            require(_arr[i].shardCount < _arr[i - 1].shardCount, 'sort failed');
        }
    }

    // todo resort 1 element addtion: bool onlyNewElement , uint8 newElementPos
    function buildNodeDesc(
        uint8[] memory _nodeList,
        uint8[SHARD_COUNT][] memory _nodeShardsSet
    ) private pure returns (NodeDesc[] memory) {
        NodeDesc[] memory nodeDesc = new NodeDesc[](_nodeList.length);
        // init nodeArr
        for (uint i = 0; i < _nodeList.length; i++) {
            uint8 nodeId = _nodeList[i];
            uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[nodeId];
            uint8 count = 0;
            for (uint shard = 0; shard < shardSet.length; shard++) {
                if (shardSet[shard] == SET_ON) {
                    count++;
                }
            }
            NodeDesc memory ns = NodeDesc(nodeId, count);
            nodeDesc[i] = ns;
        }
        return nodeDesc;
    }

    function calculateAvgPerNode(uint8[] memory _nodeList) public view returns (uint8) {
        uint8 nodeCount = uint8(_nodeList.length);
        uint8 total = SHARD_COUNT * rf;
        uint8 avgPerNode = total / nodeCount;
        // Math.ceil
        if (total % nodeCount > 0) {
            avgPerNode = avgPerNode + 1;
        }
        return avgPerNode;
    }

    function _shuffle() private returns (uint8) {
        uint8[] memory _nodeList = nodeIdList;
        uint8 _rf = rf;
        require(_rf >= 1 && _rf <= 20, "bad rf");
        require(_nodeList.length >= 0 && _nodeList.length < NULL_SHARD, "bad node count");

        uint _maxNode = 0;

//        console.log('node ids available:');
        for (uint i = 0; i < _nodeList.length; i++) {
            uint8 nodeId = _nodeList[i];

            // todo REMOVE
//            console.log('nodeId', nodeId);
            if (nodeId > _maxNode) {
                _maxNode = nodeId;
            }
        }
        require(_maxNode < MAX_NODE_ID);

        // copy storage to memory
        // nodeShardsSet[i][j] = 1, if nodeI has shard J
        // nodeShardsSet[i][j] = 0, if nodeI has no shard J assigned
        uint8[] memory _nodeModifiedSet = new uint8[](_maxNode + 1);
        // n arrays , each is of SHARD_COUNT size 
        uint8[SHARD_COUNT][] memory _nodeShardsSet = new uint8[SHARD_COUNT][](_maxNode + 1);
        for (uint i = 0; i < _nodeList.length; i++) {
            uint8 nodeId = _nodeList[i];
            require(nodeId >= 1, 'nodes are 1 based');
            unpackBitmapToShards(mapNodeToShards[nodeId], _nodeShardsSet, nodeId);

            uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[nodeId];
            require(shardSet.length == SHARD_COUNT, 'bad length');
        }
        // todo remove
//        console.log('after unpacking from storage');
//        for (uint8 i = 0; i < _nodeList.length; i++) {
//            uint8 nodeId = _nodeList[i];
//
//            uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[nodeId];
//            for(uint8 k = 0; k<shardSet.length;k++) {
//                if(shardSet[k]==SET_ON) {
//                    console.log(nodeId, ' has ', k);
//                }
//            }
//        }

        // calculate all possible shards x replication factor; 
        // a collection of shardIds
        // unusedArr = [5, -1, 0, 1];
        // results in: 5,0,1 are in a set, -1 = nothing here
        uint8[] memory _unusedArr = new uint8[](_rf * SHARD_COUNT);
        uint16 cnt = 0;
        for (uint i = 0; i < _rf; i++) {
            for (uint8 shard = 0; shard < SHARD_COUNT; shard++) {
                _unusedArr[cnt++] = shard;
            }
        }

        // todo REMOVE
//        console.log('unused after applying rf');
//        for (uint8 i = 0; i < _unusedArr.length; i++) console.log('unused ', _unusedArr[i]);

        // check unused, and no-longer assigned
        for (uint i = 0; i < _nodeList.length; i++) {
            uint nodeId = _nodeList[i];
            uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[nodeId];
            for (uint shard = 0; shard < SHARD_COUNT; shard++) { // todo wtf is this
                // search this shard
                if (shardSet[nodeId] == SET_OFF) {
                    continue;
                }
                int unusedPos = - 1;
                for (uint j = 0; j < _unusedArr.length; j++) {
                    if (_unusedArr[j] == shard) {
                        unusedPos = int(j);
                        break;
                    }
                }
                // decide
                if (unusedPos == - 1) {
                    // over-assigned - this food is no longer available
                    shardSet[shard] = SET_OFF;
                    _nodeModifiedSet[nodeId]++;
                } else {
                    // this food is used
                    _unusedArr[uint(unusedPos)] = NULL_SHARD;
                }
            }
        }
        // todo REMOVE
//        console.log('unused after removing existing mappings');
//        for (uint8 i = 0; i < _unusedArr.length; i++) console.log('unused2 ', _unusedArr[i]);
//        for (uint8 i = 0; i < _nodeList.length; i++) {
//            uint8 nodeId = _nodeList[i];
//
//            uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[nodeId];
//            for (uint8 k = 0; k < shardSet.length; k++) {
//                if (shardSet[k] == SET_ON) {
//                    console.log(nodeId, ' had ', k);
//                }
//            }
//        }

        // cleanup unused from empty slots (-1); normally most of them would be empty;
        {
            uint8 emptyCnt = 0;
            for (uint j = 0; j < _unusedArr.length; j++) {
                if (_unusedArr[j] == NULL_SHARD) {
                    emptyCnt++;
                }
            }
            uint8[] memory _tmp = new uint8[](_unusedArr.length - emptyCnt);
            uint8 dst = 0;
            for (uint i = 0; i < _unusedArr.length; i++) {
                if (_unusedArr[i] != NULL_SHARD) {
                    _tmp[dst] = _unusedArr[i];
                    dst++;
                }
            }
            _unusedArr = _tmp;
        }

        uint8 avgPerNode = calculateAvgPerNode(_nodeList);
//        console.log('avg per node', avgPerNode);

        // 1 take unused, offer it only to poor
        distributeUnused(_unusedArr, _nodeList, _nodeShardsSet, _nodeModifiedSet, true, avgPerNode);

        // todo remove
//        for (uint8 i = 0; i < _unusedArr.length; i++) console.log('unused3 ', _unusedArr[i]);
//        for (uint8 i = 0; i < _nodeList.length; i++) {
//            uint8 nodeId = _nodeList[i];
//
//            uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[i];
//            for(uint8 k = 0; k<shardSet.length;k++) {
//                if(shardSet[k]==SET_ON) {
//                    console.log(nodeId, ' has ', k);
//                }
//            }
//        }

        // 2. every node that is richer than some AVG - SHOULD try to give to the poor, 
        // starting from the poorest first
        NodeDesc[] memory poorList = buildNodeDesc(_nodeList, _nodeShardsSet);
        NodeDesc[] memory richList = new NodeDesc[](poorList.length); // copy
        for (uint i = 0; i < poorList.length; i++) {
            richList[i] = poorList[i];
        }
        sortNodesAndSize(richList);
        for (uint i = richList.length; i > 0;) {
            i--;
            NodeDesc memory rich = richList[i];
            if (rich.shardCount < avgPerNode / 2) {
                continue;
            }
            sortNodesAndSize(poorList); // resort after every donation
            uint8[SHARD_COUNT] memory richShardsSet = _nodeShardsSet[rich.node];
            // every item from the end of the queue (to minimize the data moves)
            for (uint shard = richShardsSet.length; shard > 0;) {
                shard--;
                // to every poor
                for (uint j = 0; j < poorList.length && j < i; j++) { // todo is j < i correct ???????
                    NodeDesc memory poor = poorList[j];
                    uint8[SHARD_COUNT] memory poorShardsSet = _nodeShardsSet[poor.node];
                    if (!(rich.shardCount > poor.shardCount + 1)) {
                        break;
                    }
                    if ((poorShardsSet[shard] == SET_OFF)) {
//                        console.log('rich ', rich.shardCount, ' poor', poor.shardCount);
                        richShardsSet[shard] = SET_OFF;
                        rich.shardCount--;
                        _nodeModifiedSet[rich.node]++;

                        poorShardsSet[shard] = SET_ON;
                        poor.shardCount++;
                        _nodeModifiedSet[poor.node]++;
                        // todo remove
//                        console.log(shard, rich.node, '->', poor.node);
                        break;
                    }
                }
            }
        }
        // todo remove
//        console.log('after redistribution');
//        for (uint i = 0; i < _nodeList.length; i++) {
//            uint8 nodeId = _nodeList[i];
////            if(nodeId!=1) {
////                break;
////            }
//            uint8[SHARD_COUNT] memory shardSet = _nodeShardsSet[nodeId];
//            uint count = 0;
//            for (uint8 k = 0; k < shardSet.length; k++) {
//                if (shardSet[k] == SET_ON) {
//                    console.log(nodeId, ' has ', k);
//                    count++;
//                }
//            }
//            if (count == 0) {
//                console.log(nodeId, ' has nothing');
//            }
//        }
        // 3 take unused food, offer it to everyone
        distributeUnused(_unusedArr, _nodeList, _nodeShardsSet, _nodeModifiedSet, false, avgPerNode);

        // 4 save to storage , only modified nodes
        uint8 _modifiedNodes = 0;
        {
            for (uint8 node = 1; node < _nodeModifiedSet.length; node++) {
                if (_nodeModifiedSet[node] > 0) {
                    uint32 bitmap = packShardsToBitmap(_nodeShardsSet, node);
                    mapNodeToShards[node] = bitmap;
//                    console.log(node, ' stores bitmask ', bitmap);
                    _modifiedNodes++;
                }
            }
        }
        // 5 send events
        {
            uint8[] memory _modifiedNodesArr = new uint8[](_modifiedNodes);
            uint pos = 0;
            for (uint8 nodeId = 1; nodeId < _nodeModifiedSet.length; nodeId++) {
                if (_nodeModifiedSet[nodeId] > 0) {
                    _modifiedNodesArr[pos++] = nodeId;
//                    console.log('shuffle() node modified', nodeId);
                }
            }
//            console.log('emitting ', _modifiedNodesArr.length);
            emit SNodeMappingChanged(_modifiedNodesArr);
        }
        return _modifiedNodes;
    }
}
