//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

// todo remove
import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

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

*/
contract StorageV1 is Ownable2StepUpgradeable, UUPSUpgradeable {
    // number of shards;
    // this value should not change after deploy
    // also this should match data type in mapNodeToShards (uint32/64/128/256)
    uint8 public constant SHARD_COUNT = 32;

    uint8 public constant SET_ON = 1; // for set we use uint8(1) as on, and uint8(0) as off
    uint8 public constant SET_OFF = 0;
    uint8 public constant NULL_SHARD = 255; // shard id that does not exists
    uint8 public constant MAX_NODE_ID = 254; // max node
    uint8 public constant NULL_NODE = 0;

    // ----------------------------- STATE --------------------------------------------------
    // replication factor - how many copies of the same shard should be served by the network
    // dynamic,
    // ex: 1....20
    uint8 public rf;
    // if 5 nodes join, we will set rf to 5 and then it won't grow
    uint8 public rfTarget; // 0 to turn off

    // active nodeIds
    // nodeIds are 1-based
    // ex: [1,2,3]
    // NULL_NODE = EMPTY
    uint8[] public nodeIdList;

    // NULL_NODE = EMPTY
    mapping(uint8 => address) public mapNodeIdToAddr;

    // nodeId -> shards
    // shards are 0-based
    // ex: 1 -> 0,1,2
    mapping(uint8 => uint32) public mapNodeToShards;

    // NODE DATA
    // node address -> nodeId (short address)
    // ex: 0xAAAAAAAAA -> 1
    mapping(address => uint8) public mapAddrToNodeId;

    uint8 private unusedNodeId;

    address public validatorContract;

    uint16 public protocolVersion;

    // ----------------------------- EVENTS --------------------------------------------------

    event SNodeMappingChanged(address[] nodeList);

    // ----------------------------- UPGRADABLE --------------------------------------------------

    // an empty constructor; constructor is replaced with initialize()
    constructor() {
    }

    // called only once when a proxy gets deployed; for updates use reinitializer
    function initialize(
        uint16 protocolVersion_,
        address validatorContract_,
        uint8 rfTarget_
    ) initializer public {
        // init libraries
        __UUPSUpgradeable_init();
        __Ownable_init_unchained();

        unusedNodeId = 1;
        rf = 0;
        protocolVersion = protocolVersion_;
        rfTarget = rfTarget_;
        validatorContract = validatorContract_;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ----------------------------- ADMIN FUNCTIONS --------------------------------------------------

    // allows to set replication factor manually; however this is limited by node count;
    function overrideRf(uint8 _rf) public onlyOwner {
//        require(_rf <= nodeIdList.length, 'rf is limited by node count');
        rf = _rf;
        rfTarget = 0;
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

    // ----------------------------- VALIDATOR FUNCTIONS --------------------------------------------------

    modifier onlyV() {
        require(validatorContract == _msgSender() || owner() == _msgSender(),
            "Ownable: caller is not the owner");
        _;
    }

    // todo add staking (or merge with Validator code)
    function addNodeAndStake(address nodeAddress) public onlyV returns (uint8) {
//        console.log('addNodeAndStake', nodeAddress);
        require(mapAddrToNodeId[nodeAddress] == 0, 'address is already registered');
        require(unusedNodeId > 0 && unusedNodeId < MAX_NODE_ID, 'nodeId > 0 && nodeId < max');
        uint8 newNodeId = unusedNodeId++;
        nodeIdList.push(newNodeId);
        mapNodeIdToAddr[newNodeId] = nodeAddress;
        mapAddrToNodeId[nodeAddress] = newNodeId;
        mapNodeToShards[newNodeId] = 0; // for safety only
        // add more copies of the data if the network can handle it, unless we get enough
        if (rfTarget != 0 && rf < rfTarget && rf < nodeIdList.length) {
            rf++;
//            console.log('rf is now', rf);
        }
        _shuffle();
//        console.log('addNodeAndStake finished');
        return unusedNodeId;
    }

    function removeNode(address nodeAddress) public onlyV {
        uint8 nodeId = mapAddrToNodeId[nodeAddress];
        if (nodeId == NULL_NODE) {
            revert('no address found');
        }
        if (nodeIdList.length == 0) {
            // mapping exists, but node has no short id
            delete mapAddrToNodeId[nodeAddress];
            revert('no node id found');
        }
        // valid nodeId ;

        // cleanup shards
        delete mapNodeToShards[nodeId];

        // cleanup ids
        uint nodeIdLen = nodeIdList.length;
        for (uint i = 0; i < nodeIdLen; i++) {
            if (nodeIdList[i] == nodeId) {
                // shrink array
                nodeIdList[i] = nodeIdList[nodeIdLen - 1];
                nodeIdList.pop();
                break;
            }
        }
        unusedNodeId--;

        // cleanup addresses
        delete mapNodeIdToAddr[nodeId];
        if (rfTarget != 0 && rf > nodeIdList.length) {
            rf--;
//            console.log('rf is now', rf);
        }
        address[] memory _arr = new address[](1);
        _arr[0] = nodeAddress;
        emit SNodeMappingChanged(_arr);
        _shuffle();
    }

    // ----------------------------- IMPL --------------------------------------------------

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

    function getBit(uint32 self, uint8 index) private pure returns (uint8) {
        return uint8(self >> index & 1);
    }

    function setBit(uint32 self, uint8 index) private pure returns (uint32) {
        return self | uint32(1) << index;
    }

    function clearBit(uint32 self, uint8 index) private pure returns (uint32) {
        return self & ~(uint32(1) << index);
    }


    function calculateAvgPerNode(uint8[] memory _nodeList, uint8[] memory _countersMap
    ) public view returns (uint avgPerNode, uint demand) {
        uint _nodeCount = uint8(_nodeList.length);
        uint _total = uint(SHARD_COUNT) * rf;
        uint _avgPerNode = _nodeCount == 0 ? 0 : _total / _nodeCount;
        // Math.ceil
        if (_total % _nodeCount > 0) {
            _avgPerNode = _avgPerNode + 1;
        }
        uint _demand = 0;
        for (uint i = 0; i < _nodeList.length; i++) {
            uint8 nodeId = _nodeList[i];
            uint8 shardCount = _countersMap[nodeId];
            if (shardCount < _avgPerNode) {
//                console.log('checking demand for', nodeId, shardCount);
                _demand += _avgPerNode - shardCount;
            }
        }

//        for (uint i = 0; i < _nodeList.length; i++) {
//            console.log('#', i);
//            console.log(_nodeList[i], 'has shards size', _countersMap[_nodeList[i]]);
//        }

        return (_avgPerNode, _demand);
    }

    function _shuffle() private returns (uint8) {
        uint8[] memory _nodeList = nodeIdList;
        uint _rf = rf;
        require(_rf >= 0 && _rf <= MAX_NODE_ID, "bad rf");
        require(_nodeList.length >= 0 && _nodeList.length < NULL_SHARD, "bad node count");

        uint8 _maxNode = 0;

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
        // nodeShardsSet[i]: bit(J) = 1, if nodeI has shard J
        uint8[] memory _nodeModifiedSet = new uint8[](_maxNode + 1);
        uint32[] memory _nodeShardsBitmap = new uint32[](_maxNode + 1);
        for (uint i = 0; i < _nodeList.length; i++) {
            uint8 nodeId = _nodeList[i];
            require(nodeId >= 1, 'nodes are 1 based');
            _nodeShardsBitmap[nodeId] = mapNodeToShards[nodeId];
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
        uint cnt = 0;
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
            uint32 shardmask = _nodeShardsBitmap[nodeId];
            for (uint8 shard = 0; shard < SHARD_COUNT; shard++) { // todo wtf is this
                // search this shard
                if (getBit(shardmask, shard) == 0) {
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
                    _nodeShardsBitmap[nodeId] = setBit(shardmask, shard);
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
            uint emptyCnt = 0;
            for (uint j = 0; j < _unusedArr.length; j++) {
                if (_unusedArr[j] == NULL_SHARD) {
                    emptyCnt++;
                }
            }
            uint8[] memory _tmp = new uint8[](_unusedArr.length - emptyCnt);
            uint dst = 0;
            for (uint i = 0; i < _unusedArr.length; i++) {
                if (_unusedArr[i] != NULL_SHARD) {
                    _tmp[dst] = _unusedArr[i];
                    dst++;
                }
            }
            _unusedArr = _tmp;
        }

        if (nodeIdList.length > 0) {
            // 1 take unused and share
            uint8[] memory _countersMap = buildCounters(_nodeList, _maxNode, _nodeShardsBitmap);
            uint _assignedCounter = distributeUnused2(_unusedArr, _nodeList, _countersMap, _nodeShardsBitmap, _nodeModifiedSet, 0);
            console.log('distributed shards count:', _assignedCounter);
            uint _avgPerNode;
            uint _demand;
            (_avgPerNode, _demand) = calculateAvgPerNode(_nodeList, _countersMap);
            console.log('avgPerNode', _avgPerNode);
            console.log('demand', _demand);

            // 2 take from rich and share, until the demand kpi is reached
//            console.log('moving started');
            while (_demand > 0) {
                uint movedCount = distributeFromRightToLeft(_nodeList, _countersMap,
                    _nodeShardsBitmap, _nodeModifiedSet);
                if (movedCount > 0) {
                    _demand -= movedCount;
//                    console.log('moved count/demand', movedCount, _demand);
                } else {
//                    console.log('moving finished');
                    break;
                }
            }
        }

        // 4 save to storage , only modified nodes
        uint8 _modifiedNodes = 0;
        {
            for (uint8 node = 1; node < _nodeModifiedSet.length; node++) {
                if (_nodeModifiedSet[node] > 0) {
                    uint32 bitmap = _nodeShardsBitmap[node];
                    mapNodeToShards[node] = bitmap;
                    console.log(node, ' stores bitmask ', bitmap);
                    _modifiedNodes++;
                }
            }
        }
        // 5 send events
        {
            address[] memory _modifiedAddrArr = new address[](_modifiedNodes);
            uint pos = 0;
            for (uint8 nodeId = 1; nodeId < _nodeModifiedSet.length; nodeId++) {
                if (_nodeModifiedSet[nodeId] > 0) {
                    _modifiedAddrArr[pos++] = mapNodeIdToAddr[nodeId];
                    console.log('shuffle() node modified', nodeId);
                }
            }
            console.log('emitting X events:', _modifiedAddrArr.length);
            emit SNodeMappingChanged(_modifiedAddrArr);
        }
        return _modifiedNodes;
    }

    // NEW VERSION

    function sortCounters(uint8[] memory _nodesList, uint8[] memory _countersMap, int _left, int _right) private {
        int i = _left;
        int j = _right;
        if (i == j) return;
        uint8 pivotCount = _countersMap[uint(_nodesList[uint(_left + (_right - _left) / 2)])];
        while (i <= j) {
            while (_countersMap[_nodesList[uint(i)]] < pivotCount) i++;
            while (pivotCount < _countersMap[_nodesList[uint(j)]]) j--;
            if (i <= j) {
                (_nodesList[uint(i)], _nodesList[uint(j)]) = (_nodesList[uint(j)], _nodesList[uint(i)]);
                i++;
                j--;
            }
        }
        if (_left < j) sortCounters(_nodesList, _countersMap, _left, j);
        if (i < _right) sortCounters(_nodesList, _countersMap, i, _right);
    }

    function sortCounters(uint8[] memory _nodesList, uint8[] memory _countersMap) private {
        if (_nodesList.length == 0) {
            return;
        }
        // todo remove
//        for (uint nodeId = 0; nodeId < _nodesList.length; nodeId++) {
//            require(nodeId < _countersMap.length);
//        }

        sortCounters(_nodesList, _countersMap, 0, int(_nodesList.length - 1));

        // todo remove
//        for (uint i = 0; i < _nodesList.length; i++) {
//            console.log(_nodesList[i], 'has shards size:', _countersMap[_nodesList[i]]);
//        }
//        for (uint i = 1; i < _nodesList.length; i++) {
//            if (!(_countersMap[_nodesList[i]] >= _countersMap[_nodesList[i - 1]])) {
//                revert('sort failed');
//            }
//
//        }
    }

    // todo remove
    function assertSorting(uint8[] memory _nodeList, uint8[] memory _countersMap) private {
        {
            console.log('after sort');
            for (uint i = 0; i < _nodeList.length; i++) {
                console.log('#', i);
                console.log(_nodeList[i], 'has shards size', _countersMap[_nodeList[i]]);
            }
            for (uint i = 1; i < _nodeList.length; i++) {
                require(_countersMap[_nodeList[i]] >= _countersMap[_nodeList[i - 1]], 'sort failed (2)');
            }
        }
    }

    function resortCountersRow(uint8[] memory _nodeList, uint8[] memory _countersMap, uint pos, bool increment) private {
        // todo remove
//        console.log('resortCountersRow() total nodes:', _nodeList.length, ' pos:', pos);
//        console.log('before sort');
//        for (uint i = 0; i < _nodeList.length; i++) {
//            console.log('#', i);
//            console.log(_nodeList[i], 'has shards size', _countersMap[_nodeList[i]]);
//        }

        int cur = int(pos);
        if (increment) {
            while ((cur + 1) >= 0 && (cur + 1) <= int(_nodeList.length - 1)
                && _countersMap[_nodeList[pos]] > _countersMap[_nodeList[uint(cur + 1)]]) {
                cur++;
            }
        } else {
            while ((cur - 1) >= 0 && (cur - 1) <= int(_nodeList.length - 1)
                && _countersMap[_nodeList[pos]] < _countersMap[_nodeList[uint(cur - 1)]]) {
                cur--;
            }
        }
        if (cur != int(pos)) {
//            console.log('moved to new');
//            console.log(uint(pos));
//            console.log(uint(cur));
            uint8 tmp = _nodeList[uint(cur)];
            _nodeList[uint(cur)] = _nodeList[pos];
            _nodeList[pos] = tmp;
        }
        // todo remove
//        console.log('after sort');
//        for (uint i = 0; i < _nodeList.length; i++) {
//            console.log('#', i);
//            console.log(_nodeList[i], 'has shards size', _countersMap[_nodeList[i]]);
//        }
//        for (uint i = 1; i < _nodesList.length; i++) {
//            require(_countersMap[_nodesList[i]] >= _countersMap[_nodesList[i - 1]], 'sort failed (2)');
//        }
    }

    function buildCounters(
        uint8[] memory _nodeList,
        uint8 _maxNode,
        uint32[] memory _nodeShardsBitmap
    ) private view returns (uint8[] memory) {
        uint8[] memory _countersMap = new uint8[](_maxNode + 1);
        // init nodeArr
        for (uint i = 0; i < _nodeList.length; i++) {
            uint8 nodeId = _nodeList[i];
            uint32 shardmask = _nodeShardsBitmap[nodeId];
//            console.log(nodeId, 'has shardmask', shardmask);
            uint8 count = 0;
            for (uint8 shard = 0; shard < SHARD_COUNT; shard++) {
                if (getBit(shardmask, shard) == 1) {
                    count++;
                }
            }
            _countersMap[nodeId] = count;
        }
//        console.log('buildCounters()');
//        for (uint i = 0; i < _nodeList.length; i++) {
//            console.log('#', i);
//            console.log(_nodeList[i], 'has shards size', _countersMap[_nodeList[i]]);
//        }

        return _countersMap;
    }

    function distributeUnused2(uint8[] memory _unusedArr,
        uint8[] memory _nodeList,
        uint8[] memory _countersMap,
        uint32[] memory _nodeShardsBitmap,
        uint8[] memory _nodeModifiedSet,
        uint8 _nodeThreshold
    ) private returns (uint){
        sortCounters(_nodeList, _countersMap);
        // _nodeList is sorted asc
        uint _assignedCounter = 0;
        // with every unused shard
        for (uint i = 0; i < _unusedArr.length; i++) {
            uint8 shard = _unusedArr[i];
            if (shard == NULL_SHARD) {
                continue;
            }

            // give it to someone (from poor to rich) and stop (and resort)
            for (uint8 j = 0; j < _nodeList.length; j++) {
                uint8 nodeId = _nodeList[j];
                if (_nodeThreshold > 0 && _countersMap[nodeId] >= _nodeThreshold) {
                    continue;
                }
                uint32 shardmask = _nodeShardsBitmap[nodeId];
                uint8 nodeHasShard = getBit(shardmask, shard);
                if (nodeHasShard == 0) { // todo stopOnAvg ????????????????????????
                    _unusedArr[i] = NULL_SHARD;

                    _nodeShardsBitmap[nodeId] = setBit(shardmask, shard);
                    _countersMap[nodeId]++;
                    _nodeModifiedSet[nodeId]++;
                    resortCountersRow(_nodeList, _countersMap, j, true);
                    _assignedCounter++;
//                    console.log(shard, ': unused to node ->', nodeId);
//                    console.log('counters', _countersMap[nodeId], 'bitmap', _nodeShardsBitmap[nodeId]);
//                    console.log('nodeModified', _nodeModifiedSet[nodeId]);
                    break;
                }
            }
        }
//        console.log('distributeUnused2 counters');
//        for (uint i = 0; i < _nodeList.length; i++) {
//            console.log('#', i);
//            console.log(_nodeList[i], 'has shards size', _countersMap[_nodeList[i]]);
//        }

        return _assignedCounter;
    }

    // convers bit shard mask (ex: 0b1101) to shard numbers (ex: [0,2,3]) and gets a random one (ex: 2)
    function bitMaskToRandomShard(uint32 shardmask, uint8[SHARD_COUNT] memory shardList) private returns (uint8) {
        uint8 pos = 0;
        uint8 shard = 0;
        while (shardmask != 0) {
            if (shardmask & 1 == 1) {
                shardList[pos++] = shard;
            }
            shardmask >>= 1;
            shard++;
        }
        uint8 rnd = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, shard, shardmask, pos))) % pos);
        return shardList[rnd];
    }

    function distributeFromRightToLeft(
        uint8[] memory _nodeList,
        uint8[] memory _countersMap,
        uint32[] memory _nodeShardsBitmap,
        uint8[] memory _nodeModifiedSet
    ) private returns (uint){
        if (_nodeList.length == 0) {
            return 0;
        }
        sortCounters(_nodeList, _countersMap);
        uint i = 0;
        uint j = _nodeList.length - 1;
        uint8[SHARD_COUNT] memory tmp;
        while (i < j) {
            uint8 leftNode = _nodeList[i];
            uint8 rightNode = _nodeList[j];
            uint32 transfer = (_nodeShardsBitmap[leftNode] ^ _nodeShardsBitmap[rightNode])
                & (~_nodeShardsBitmap[leftNode]);
//            console.log('>>>>> starting moving from/to', rightNode, leftNode);
//            console.log('***** shardBitmaps from/to/transfer', transfer, _nodeShardsBitmap[rightNode], _nodeShardsBitmap[leftNode]);
            if (transfer != 0) {
                // give
                uint8 shard = bitMaskToRandomShard(transfer, tmp);
                _nodeShardsBitmap[rightNode] = clearBit(_nodeShardsBitmap[rightNode], shard);
                _countersMap[rightNode]--;
                _nodeModifiedSet[rightNode]++;

                _nodeShardsBitmap[leftNode] = setBit(_nodeShardsBitmap[leftNode], shard);
                _countersMap[leftNode]++;
                _nodeModifiedSet[leftNode]++;

                resortCountersRow(_nodeList, _countersMap, i, true);
                resortCountersRow(_nodeList, _countersMap, j, false);

                // todo remove
//                assertSorting(_nodeList, _countersMap);

//                console.log(rightNode, '->', leftNode);
//                console.log('<<<<< done moving shard ', shard);
                return 1;
            }
            i++;
            j--;
        }
        return 0;
    }
}
