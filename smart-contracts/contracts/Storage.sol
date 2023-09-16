//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/*


Goal:
support workflows like this

a node n1 joins a cluster, where every node is responsible for X vshards of data
we have M amount of vshards at the start (a predefined value)

the algorithm should ensure that
- a network maintains exactly [replication factor] amount of chunks in total on all nodes
- if a node joins/leaves the data is re-distributed (the goal is to minimize gas gosts here)
- replication factor can change - it goes up (no more than # of nodes in total) and goes down to 1
- re-distribution should affect the least amount of nodes possible (optional goal)
- re-distribution should favor grabbing fresh shards instead of old ones (optional goal)
- difference between node with most vshards and least vshards should stay as close to ±1 as possible
- registration of first N nodes will raise replication factor to rfTarget;
- an event is emitted stating which nodes have been modified


Example:
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

todo getNodeShardsByAddr return an array instead of bitmap?
*/
contract StorageV1 is Ownable2StepUpgradeable, UUPSUpgradeable {
    // number of shards;
    // this value should not change after deploy
    // also this should match data type in mapNodeToShards (uint32/64/128/256)
    uint8 public constant SHARD_COUNT = 32;

    uint8 public constant NULL_SHARD = 255; // shard id that does not exists
    uint8 public constant MAX_NODE_ID = 254; // max node
    uint8 public constant NULL_NODE = 0;

    // ----------------------------- STATE --------------------------------------------------
    // replication factor - how many copies of the same shard should be served by the network
    // dynamic,
    // ex: 1....20
    uint8 public rf;
    bool public rfChangedByAdmin; // only for admin calling shuffle manually
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

    // next free value of nodeId
    uint8 private unusedNodeId;
    // other free values of nodeId (added after delete operation)
    uint8[] private unusedNodeIdList;

    // this is a security check that only validator contract calls our methods
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
    // call shuffle after this to take effect
    function overrideRf(uint8 rf_) public onlyOwner {
        require(rf_ <= nodeIdList.length, 'rf is limited by node count');
        rf = rf_;
        rfChangedByAdmin = true;
        rfTarget = 0;
    }

    // revert back to automated replication factor (rf grows up to rfTarget when possible)
    // call shuffle after this to take effect
    function setRfTarget(uint8 rfTarget_) public onlyOwner {
        rfTarget = rfTarget_;
        uint rf_ = rfTarget_;
        if (rf_ > nodeIdList.length) {
            rf_ = nodeIdList.length;
        }
        rf = uint8(rf_);
        rfChangedByAdmin = true;
    }

    // allows to set
    function setNodeShardsByAddr(address nodeAddress_, uint32 bitmap_) public onlyOwner {
        uint8 node = mapAddrToNodeId[nodeAddress_];
        require(node > 0, 'node address is not registered');
        mapNodeToShards[node] = bitmap_;
    }

    function shuffle() public onlyOwner returns (uint) {
        uint result = _shuffle(rfChangedByAdmin, false, 0);
        rfChangedByAdmin = false;
        return result;
    }

    function getAllNodeShards(address[] memory nodeAddr_) public view returns (uint32[] memory) {
        uint32[] memory nodeMasks = new uint32[](nodeAddr_.length);
        for (uint i = 0; i < nodeAddr_.length; i++) {
            uint8 nodeId = mapAddrToNodeId[nodeAddr_[i]];
            uint32 shardmask = mapNodeToShards[nodeId];
            nodeMasks[i] = shardmask;
        }
        return nodeMasks;
    }

    function setValidatorContract(address addr_) public onlyOwner {
        validatorContract = addr_;
    }

    // ----------------------------- VALIDATOR FUNCTIONS --------------------------------------------------

    modifier onlyV() {
        require(validatorContract == _msgSender() || owner() == _msgSender(),
            "Ownable: caller is not the owner");
        _;
    }

    function addNode(address nodeAddress_) public onlyV returns (uint8) {
        require(mapAddrToNodeId[nodeAddress_] == 0, 'address is already registered');
        require(unusedNodeId > 0 && unusedNodeId < MAX_NODE_ID, 'nodeId > 0 && nodeId < max');
        uint8 newNodeId;
        uint unusedLenth = unusedNodeIdList.length;
        if (unusedLenth > 0) {
            newNodeId = unusedNodeIdList[unusedLenth - 1];
            unusedNodeIdList.pop();
        } else {
            newNodeId = unusedNodeId++;
        }
        nodeIdList.push(newNodeId);
        mapNodeIdToAddr[newNodeId] = nodeAddress_;
        mapAddrToNodeId[nodeAddress_] = newNodeId;
        mapNodeToShards[newNodeId] = 0; // for safety only
        // add more copies of the data if the network can handle it, unless we get enough
        bool rfChanged_ = adjustRf(1);
        _shuffle(rfChanged_, false, 0);
        return unusedNodeId;
    }

    function removeNode(address nodeAddress_) public onlyV {
        uint8 nodeId_ = mapAddrToNodeId[nodeAddress_];
        unusedNodeIdList.push(nodeId_);
        if (nodeId_ == NULL_NODE) {
            revert('no address found');
        }
        if (nodeIdList.length == 0) {
            // mapping exists, but node has no short id
            delete mapAddrToNodeId[nodeAddress_];
            revert('no node id found');
        }
        // valid nodeId ;

        // cleanup shards
        uint32 nodeShardMask_ = mapNodeToShards[nodeId_];
        delete mapNodeToShards[nodeId_];

        // cleanup ids
        uint nodeIdLen_ = nodeIdList.length;
        for (uint i = 0; i < nodeIdLen_; i++) {
            if (nodeIdList[i] == nodeId_) {
                // shrink array
                if (i != nodeIdLen_ - 1) {
                    nodeIdList[i] = nodeIdList[nodeIdLen_ - 1];
                }
                nodeIdList.pop();
                break;
            }
        }

        // cleanup addresses
        delete mapNodeIdToAddr[nodeId_];
        bool rfChanged_ = adjustRf(- 1);
        address[] memory _arr = new address[](1);
        _arr[0] = nodeAddress_;
        emit SNodeMappingChanged(_arr);
        _shuffle(rfChanged_, true, nodeShardMask_);
    }

    // ----------------------------- IMPL --------------------------------------------------

    function getNodeShardsByAddr(address nodeAddress_) public view returns (uint32) {
        uint8 nodeId_ = mapAddrToNodeId[nodeAddress_];
        require(nodeId_ > 0, 'no such node');
        return mapNodeToShards[nodeId_];
    }

    function nodeCount() public view returns (uint8) {
        return uint8(nodeIdList.length);
    }

    function getNodeAddresses() public view returns (address[] memory) {
        uint size = nodeIdList.length;
        address[] memory nodeAddrArr = new address[](size);
        for (uint i = 0; i < size; i++) {
            uint8 nodeId = nodeIdList[i];
            nodeAddrArr[i] = mapNodeIdToAddr[nodeId];
        }
        return nodeAddrArr;
    }

    function getBit(uint32 self_, uint8 index_) private pure returns (uint8) {
        return uint8(self_ >> index_ & 1);
    }

    function setBit(uint32 self_, uint8 index_) private pure returns (uint32) {
        return self_ | uint32(1) << index_;
    }

    function clearBit(uint32 self_, uint8 index_) private pure returns (uint32) {
        return self_ & ~(uint32(1) << index_);
    }

    function adjustRf(int adjust_) private returns (bool){
        bool rfChanged_ = rfChangedByAdmin; // if admin changed rf = we need full recalculation
        if (rfChanged_) {
            rfChangedByAdmin = false; // clear flag
        }
        int rf_ = int(uint(rf));
        int rfNew_ = rf_ + adjust_;
        if (rfTarget != 0 && rfNew_ >= 0 && rfNew_ <= int(uint(rfTarget)) && rfNew_ <= int(nodeIdList.length)) {
            rf = uint8(uint(rfNew_));
            rfChanged_ = true;
        }
        return rfChanged_;
    }

    function calculateAvgPerNode(uint8[] memory nodeList_, uint8[] memory countersMap_
    ) public view returns (uint avgPerNode_, uint demand_) {
        uint _nodeCount = uint8(nodeList_.length);
        uint _total = uint(SHARD_COUNT) * rf;
        uint _avgPerNode = _nodeCount == 0 ? 0 : _total / _nodeCount;
        // Math.ceil
        if (_total % _nodeCount > 0) {
            _avgPerNode = _avgPerNode + 1;
        }
        uint _demand = 0;
        for (uint i = 0; i < nodeList_.length; i++) {
            uint8 nodeId = nodeList_[i];
            uint8 shardCount = countersMap_[nodeId];
            if (shardCount < _avgPerNode) {
                _demand += _avgPerNode - shardCount;
            }
        }
        return (_avgPerNode, _demand);
    }

    function _shuffle(bool rfChanged_, bool nodeRemoved_, uint32 removedNodeShardmask_) private returns (uint8) {
        uint8[] memory nodeList_ = nodeIdList;
        uint rf_ = rf;
        require(rf_ >= 0 && rf_ <= MAX_NODE_ID, "bad rf");
        require(nodeList_.length >= 0 && nodeList_.length < NULL_SHARD, "bad node count");

        uint8 maxNode_ = 0;
        for (uint i = 0; i < nodeList_.length; i++) {
            uint8 nodeId = nodeList_[i];
            if (nodeId > maxNode_) {
                maxNode_ = nodeId;
            }
        }
        require(maxNode_ < MAX_NODE_ID);

        // copy storage to memory
        // nodeShardsSet[i]: bit(J) = 1, if nodeI has shard J
        uint8[] memory nodeModifiedSet_ = new uint8[](maxNode_ + 1);
        uint32[] memory nodeShardsBitmap_ = new uint32[](maxNode_ + 1);
        for (uint i = 0; i < nodeList_.length; i++) {
            uint8 nodeId = nodeList_[i];
            require(nodeId >= 1, 'nodes are 1 based');
            nodeShardsBitmap_[nodeId] = mapNodeToShards[nodeId];
        }
        uint8[] memory unusedArr_ = buildUnused(nodeList_, nodeShardsBitmap_, nodeModifiedSet_,
            rf_, rfChanged_, nodeRemoved_, removedNodeShardmask_);

        if (nodeIdList.length > 0) {
            // 1 take unused and share
            uint8[] memory countersMap_ = buildCounters(nodeList_, maxNode_, nodeShardsBitmap_);
            distributeUnused(unusedArr_, nodeList_, countersMap_, nodeShardsBitmap_, nodeModifiedSet_, 0);
            uint avgPerNode_;
            uint demand_;
            (avgPerNode_, demand_) = calculateAvgPerNode(nodeList_, countersMap_);
            // 2 take from rich and share, until the demand kpi is reached
            while (demand_ > 0) {
                uint movedCount_ = distributeFromRightToLeft(nodeList_, countersMap_,
                    nodeShardsBitmap_, nodeModifiedSet_);
                if (movedCount_ > 0) {
                    demand_ -= movedCount_;
                } else {
                    break;
                }
            }
        }

        // 4 save to storage , only modified nodes
        uint8 modifiedNodes_ = 0;
        {
            for (uint8 node = 1; node < nodeModifiedSet_.length; node++) {
                if (nodeModifiedSet_[node] > 0) {
                    uint32 bitmap = nodeShardsBitmap_[node];
                    mapNodeToShards[node] = bitmap;
                    modifiedNodes_++;
                }
            }
        }
        // 5 send events
        {
            address[] memory modifiedAddrArr_ = new address[](modifiedNodes_);
            uint pos = 0;
            for (uint8 nodeId = 1; nodeId < nodeModifiedSet_.length; nodeId++) {
                if (nodeModifiedSet_[nodeId] > 0) {
                    modifiedAddrArr_[pos++] = mapNodeIdToAddr[nodeId];
                }
            }
            emit SNodeMappingChanged(modifiedAddrArr_);
        }
        return modifiedNodes_;
    }

    function buildUnused(uint8[] memory nodeList_, uint32[] memory nodeShardsBitmap_, uint8[] memory nodeModifiedSet_,
        uint _rf, bool rfChanged_, bool nodeRemoved_, uint32 removedNodeShardmask_) private pure returns (uint8[] memory){
        uint8[] memory unusedArr_;
        if (!rfChanged_ && !nodeRemoved_) {
            // do nothing - number of unused doesn't change
            unusedArr_ = new uint8[](0);
            return unusedArr_;
        }
        if (nodeRemoved_) {
            // only 1 node added to unused
            unusedArr_ = new uint8[](SHARD_COUNT);
            for (uint8 shard = 0; shard < SHARD_COUNT; shard++) {
                unusedArr_[shard] = getBit(removedNodeShardmask_, shard) == 1 ? shard : NULL_SHARD;
            }
            return unusedArr_;
        }
        // rf changed - full recalculation O(SHARDCOUNT * RF * NODE_COUNT)
        // calculate all possible shards x replication factor;
        // a collection of shardIds
        // unusedArr = [5, -1, 0, 1];
        // results in: 5,0,1 are in a set, -1 = nothing here
        unusedArr_ = new uint8[](_rf * SHARD_COUNT);
        uint cnt = 0;
        for (uint i = 0; i < _rf; i++) {
            for (uint8 shard = 0; shard < SHARD_COUNT; shard++) {
                unusedArr_[cnt++] = shard;
            }
        }
        // check unused, and no-longer assigned
        for (uint i = 0; i < nodeList_.length; i++) {
            uint nodeId_ = nodeList_[i];
            uint32 shardmask_ = nodeShardsBitmap_[nodeId_];
            for (uint8 shard = 0; shard < SHARD_COUNT; shard++) {
                // search this shard
                if (getBit(shardmask_, shard) == 0) {
                    continue;
                }
                int unusedPos_ = - 1;
                for (uint j = 0; j < unusedArr_.length; j++) {
                    if (unusedArr_[j] == shard) {
                        unusedPos_ = int(j);
                        break;
                    }
                }
                // decide
                if (unusedPos_ == - 1) {
                    // over-assigned - this food is no longer available
                    shardmask_ = clearBit(shardmask_, shard);
                    nodeModifiedSet_[nodeId_]++;
                } else {
                    // this food is used
                    unusedArr_[uint(unusedPos_)] = NULL_SHARD;
                }
            }
            nodeShardsBitmap_[nodeId_] = shardmask_;
        }
        // cleanup unused from empty slots (-1); normally most of them would be empty;
        {
            uint emptyCnt_ = 0;
            for (uint j = 0; j < unusedArr_.length; j++) {
                if (unusedArr_[j] == NULL_SHARD) {
                    emptyCnt_++;
                }
            }
            uint8[] memory tmp_ = new uint8[](unusedArr_.length - emptyCnt_);
            uint dst_ = 0;
            for (uint i = 0; i < unusedArr_.length; i++) {
                if (unusedArr_[i] != NULL_SHARD) {
                    tmp_[dst_] = unusedArr_[i];
                    dst_++;
                }
            }
            unusedArr_ = tmp_;
        }
        return unusedArr_;
    }

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

    function sortCounters(uint8[] memory nodesList_, uint8[] memory countersMap_) private {
        if (nodesList_.length == 0) {
            return;
        }
        sortCounters(nodesList_, countersMap_, 0, int(nodesList_.length - 1));
    }

    function resortCountersRow(uint8[] memory nodeList_, uint8[] memory countersMap_, uint pos_, bool increment_) private pure {
        int cur = int(pos_);
        if (increment_) {
            while ((cur + 1) >= 0 && (cur + 1) <= int(nodeList_.length - 1)
                && countersMap_[nodeList_[pos_]] > countersMap_[nodeList_[uint(cur + 1)]]) {
                cur++;
            }
        } else {
            while ((cur - 1) >= 0 && (cur - 1) <= int(nodeList_.length - 1)
                && countersMap_[nodeList_[pos_]] < countersMap_[nodeList_[uint(cur - 1)]]) {
                cur--;
            }
        }
        if (cur != int(pos_)) {
            uint8 tmp = nodeList_[uint(cur)];
            nodeList_[uint(cur)] = nodeList_[pos_];
            nodeList_[pos_] = tmp;
        }
    }

    function buildCounters(
        uint8[] memory nodeList_,
        uint8 maxNode_,
        uint32[] memory nodeShardsBitmap_
    ) private pure returns (uint8[] memory) {
        uint8[] memory _countersMap = new uint8[](maxNode_ + 1);
        // init nodeArr
        for (uint i = 0; i < nodeList_.length; i++) {
            uint8 nodeId = nodeList_[i];
            uint32 shardmask = nodeShardsBitmap_[nodeId];
            uint8 count = 0;
            for (uint8 shard = 0; shard < SHARD_COUNT; shard++) {
                if (getBit(shardmask, shard) == 1) {
                    count++;
                }
            }
            _countersMap[nodeId] = count;
        }
        return _countersMap;
    }

    function distributeUnused(uint8[] memory unusedArr_,
        uint8[] memory nodeList_,
        uint8[] memory countersMap_,
        uint32[] memory nodeShardsBitmap_,
        uint8[] memory nodeModifiedSet_,
        uint8 nodeThreshold_
    ) private returns (uint){
        if (unusedArr_.length == 0) {
            return 0;
        }
        sortCounters(nodeList_, countersMap_);
        // _nodeList is sorted asc
        uint assignedCounter_ = 0;
        // with every unused shard
        for (uint i = 0; i < unusedArr_.length; i++) {
            uint8 shard = unusedArr_[i];
            if (shard == NULL_SHARD) {
                continue;
            }

            // give it to someone (from poor to rich) and stop (and resort)
            for (uint8 j = 0; j < nodeList_.length; j++) {
                uint8 nodeId_ = nodeList_[j];
                if (nodeThreshold_ > 0 && countersMap_[nodeId_] >= nodeThreshold_) {
                    continue;
                }
                uint32 shardmask_ = nodeShardsBitmap_[nodeId_];
                uint8 nodeHasShard_ = getBit(shardmask_, shard);
                if (nodeHasShard_ == 0) {
                    unusedArr_[i] = NULL_SHARD;

                    nodeShardsBitmap_[nodeId_] = setBit(shardmask_, shard);
                    countersMap_[nodeId_]++;
                    nodeModifiedSet_[nodeId_]++;
                    resortCountersRow(nodeList_, countersMap_, j, true);
                    assignedCounter_++;
                    break;
                }
            }
        }
        return assignedCounter_;
    }

    // convers bit shard mask (ex: 0b1101) to shard numbers (ex: [0,2,3]) and gets a random one (ex: 2)
    function bitMaskToRandomShard(uint32 shardmask_, uint8[SHARD_COUNT] memory shardList_) private view returns (uint8) {
        uint8 pos_ = 0;
        uint8 shard_ = 0;
        while (shardmask_ != 0) {
            if (shardmask_ & 1 == 1) {
                shardList_[pos_++] = shard_;
            }
            shardmask_ >>= 1;
            shard_++;
        }
        uint8 rnd = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, shard_, shardmask_, pos_))) % pos_);
        return shardList_[rnd];
    }

    function distributeFromRightToLeft(
        uint8[] memory nodeList_,
        uint8[] memory countersMap_,
        uint32[] memory nodeShardsBitmap_,
        uint8[] memory nodeModifiedSet_
    ) private returns (uint){
        if (nodeList_.length == 0) {
            return 0;
        }
        sortCounters(nodeList_, countersMap_);
        uint i = 0;
        uint j = nodeList_.length - 1;
        uint8[SHARD_COUNT] memory tmp;
        while (i < j) {
            uint8 leftNode_ = nodeList_[i];
            uint8 rightNode_ = nodeList_[j];
            uint32 transfer_ = (nodeShardsBitmap_[leftNode_] ^ nodeShardsBitmap_[rightNode_])
                & (~nodeShardsBitmap_[leftNode_]);
            if (transfer_ != 0) {
                // give
                uint8 shard = bitMaskToRandomShard(transfer_, tmp);
                nodeShardsBitmap_[rightNode_] = clearBit(nodeShardsBitmap_[rightNode_], shard);
                countersMap_[rightNode_]--;
                nodeModifiedSet_[rightNode_]++;

                nodeShardsBitmap_[leftNode_] = setBit(nodeShardsBitmap_[leftNode_], shard);
                countersMap_[leftNode_]++;
                nodeModifiedSet_[leftNode_]++;

                resortCountersRow(nodeList_, countersMap_, i, true);
                resortCountersRow(nodeList_, countersMap_, j, false);
                return 1;
            }
            i++;
            j--;
        }
        return 0;
    }
}
