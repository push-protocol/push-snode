//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./Storage.sol";
import "hardhat/console.sol";

/*
Validator smart contract

# Enables a network of Validator (V), Storage (S), Delivery (D) nodes
- V performs a multi-sig on a message block within a specified group
    stakes tokens;
    Lifecycle: new - reported - slashed - banned

- S unpacks message block (a threshold amount of sigs required),
and indexes every single message: the message gets copied to every person's inbox
So that later V can query a group of storage nodes responsible for some data range
and show that inbox to the UI.
    stakes tokens ;
    Lifecycle: new - reported - slashed - banned (TBD)


- D unpacks message block (a threshold amount of sigs required),
and for every single message: delivers it to the end-users
    stakes tokens
    Lifecycle: none (TBD)


# Contracts
All the stacking, node management, slashing is done in this contrect Validator.sol
S has it's own Storage.sol contract, which manages only S shard assignments.

*/
contract ValidatorV1 is Ownable2StepUpgradeable, UUPSUpgradeable {

    // ----------------------------- STATE --------------------------------------------------

    string public constant VERSION = "0.0.2";
    uint16 public protocolVersion;

    /*  staking params (effectively constant ) */

    // number of push tokens (18 digits) to stake as Validator (V)
    uint256 public minStakeV;
    // number of push tokens (18 digits) to stake as Storage (S)
    uint256 public minStakeS;
    // number of push tokens (18 digits) to stake as Delivery (D)
    uint256 public minStakeD;

    /* validator slashing params  (effectively constant)

    report = bad behaviour,
    we accept a VoteData sign by this amout of nodes: REPORT_THRESHOLD
    we perform a slash after this amount of reports: REPORTS_BEFORE_SLASH
    */
    uint16 public REPORT_THRESHOLD_PER_BLOCK;  // i.e. 66 = 66% = 2/3
    uint16 public REPORTS_BEFORE_SLASH_V;
    uint16 public REPORTS_BEFORE_SLASH_S;

    /*
    slash = reduces node collateral for SLASH_PERCENT %

    after SLASH_BEFORE_BAN iterations, the node would get a ban
    ban = reduces node collateral for BAN_PERCENT, node address is banned forever
    */
    uint16 public SLASH_PERCENT;
    uint16 public SLASHES_BEFORE_BAN_V;
    uint16 public SLASHES_BEFORE_BAN_S;

    uint16 public BAN_PERCENT;

    /* validator validation params  (effectively constant only for V backend)
    these parameters control how nodejs processes communicate
    for the contract these a simply constants; all the logic is in JS
    */

    /*
    how many signatures is needed for a block

    A block gets signed by a 1 validator + N attesters = valPerBlockTarget

    if REPORT_PERCENT is 66% ( 2/3 of signers should agree on a block)
    3 * 67 / 100 = 201 / 100 = 2
    if we have at least 2 valid signatures out of 3 - that's a good block

    attestersCountPerBlock would grow as more nodes join the network;
    up to attestersTarget
    */
    uint16 public valPerBlock;

    // maximum amount of validator signatures per block
    // we will grow or shrink valPerBlock up to this number
    uint16 public valPerBlockTarget;


    // how many networkRandom objects are required to compute a random value
    uint16 public nodeRandomMinCount;
    // how many nodes should see the emitter of that networkRandom ; so that we could count on this network random
    uint16 public nodeRandomPingCount;

    // ----------------------------- CONTRACT STATE --------------------------------------------------

    /* registered nodes params */

    // push token used for staking/slashing etc
    IERC20 pushToken;

    // storage contract manages storage node state
    address public storageContract;

    // node colleciton
    address[] public vnodes;
    uint16 public vnodesActive;
    address[] public snodes;
    address[] public dnodes;
    mapping(address => NodeInfo) public nodeMap;

    // push tokens owned by this contract; which have an owner
    uint public totalStaked;

    // push tokens owned by this contract;
    // comes from penalties from BAN only;
    // while SLASH benefits the voters
    uint public totalFees;

    // ----------------------------- EVENTS  --------------------------------------------------
    event NodeAdded(address indexed ownerWallet, address indexed nodeWallet, NodeType nodeType, uint256 nodeTokens, string nodeApiBaseUrl);
    event NodeStatusChanged(address indexed nodeWallet, NodeStatus nodeStatus, uint256 nodeTokens);
    event NodeReported(address nodeWallet, address reporterWallet, address[] voters, VoteAction voteAction);

    event BlockParamsUpdated(uint16 valPerBlock, uint16 valPerBlockTarget);
    event RandomParamsUpdated(uint16 nodeRandomMinCount, uint16 nodeRandomPingCount);


    // ----------------------------- TYPES  --------------------------------------------------

    struct NodeInfo {
        address ownerWallet;
        address nodeWallet;       // eth wallet
        NodeType nodeType;
        uint256 nodeTokens;
        string nodeApiBaseUrl; // rest api url for invocation
        NodeCounters counters;
        // worst case status, at least 1 report or slash leads to status reported or slashed
        // OK -> reported -> slashed -> banned
        NodeStatus status;
    }

    struct NodeCounters {
        // S, V nodes -----

        // how many times this node was reported
        // cleaned on SLASH
        uint16 reportCounter;
        // how many times this node was slashed
        uint16 slashCounter;

        // block numbers where this node was reported (cleaned on BAN)
        // we prevent new reports that match any existing block in this list
        // cleaned on BAN, unstake
        uint128[] reportedInBlocks;

        // addresses who did the reports, they will receive SLASH rewards
        // cleaned on SLASH, BAN, unstake
        address[] reportedBy;

        // S nodes -------

        // keys missing (for storage nodes only)
        // we prevent new reports that match any existing key in this list
        uint128[] reportedKeys;
    }

    enum NodeStatus {
        OK, // this node operates just fine (DEFAULT VALUE)
        Reported, // he have a few malicious reports
        Slashed, // we already slashed this node at least once (normally we will take -2% of collateral tokens)
        BannedAndUnstaked, // we banned the node and unstaked it's tokens (normally we will take -10% of collateral tokens)
        Unstaked
    }

    enum VoteAction {
        None,
        ReportV,
        ReportS
    }

    enum NodeType {
        VNode, // validator 0
        SNode, // storage 1
        DNode  // delivery 2
    }

    struct VoteMessage {
        // block which was the reason to apply sanctions (i.e. bad conversion)
        uint128 blockId;
        // node to punish
        address targetNode;
        // action
        uint8 voteAction;
    }

    // ----------------------------- UPGRADABLE  --------------------------------------------------

    // an empty constructor; constructor is replaced with initialize()
    constructor() {
    }

    // called only once when a proxy gets deployed; for updates use reinitializer
    function initialize(
        uint16 protocolVersion_,
        address pushToken_,
        uint16 valPerBlockTarget_,
        uint16 nodeRandomMinCount_,
        uint16 nodeRandomPingCount_,
        uint16 REPORTS_BEFORE_SLASH_V_,
        uint16 REPORTS_BEFORE_SLASH_S_,
        uint16 SLASHES_BEFORE_BAN_V_,
        uint16 SLASHES_BEFORE_BAN_S_,
        uint16 SLASH_PERCENT_,
        uint16 BAN_PERCENT_
    ) initializer public {
        // init libraries
        __UUPSUpgradeable_init();
        __Ownable_init_unchained();
        // init state
        protocolVersion = protocolVersion_;
        require(pushToken_ != address(0));
        pushToken = IERC20(pushToken_);
        require(valPerBlockTarget_ > 0, "invalid attesters amount");
        valPerBlockTarget = valPerBlockTarget_;
        require(nodeRandomMinCount_ > 0, "invalid nodeRandomMinCount amount");
        nodeRandomMinCount = nodeRandomMinCount_;
        require(nodeRandomPingCount_ > 0, "invalid nodeRandomFilterPingsRequired amount");
        nodeRandomPingCount = nodeRandomPingCount_;

        minStakeV = 100;
        minStakeS = 100;
        minStakeD = 100;
        REPORTS_BEFORE_SLASH_V = REPORTS_BEFORE_SLASH_V_;
        REPORTS_BEFORE_SLASH_S = REPORTS_BEFORE_SLASH_S_;
        SLASH_PERCENT = SLASH_PERCENT_; // todo FIX
        SLASHES_BEFORE_BAN_V = SLASHES_BEFORE_BAN_V_;
        SLASHES_BEFORE_BAN_S = SLASHES_BEFORE_BAN_S_;
        BAN_PERCENT = BAN_PERCENT_;


        REPORT_THRESHOLD_PER_BLOCK = 66;
        valPerBlock = 0;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ----------------------------- ADMIN FUNCTIONS --------------------------------------------------

    function setStorageContract(address addr_) public onlyOwner {
        storageContract = addr_;
    }

    function updateBlockParams(uint16 valPerBlockTarget_) public onlyOwner {
        require(valPerBlockTarget_ <= vnodes.length, 'incorrect valPerBlockTarget_');
        valPerBlockTarget = valPerBlockTarget_;
        emit BlockParamsUpdated(valPerBlock, valPerBlockTarget_);
    }

    function updateRandomParams(uint16 nodeRandomMinCount_, uint16 nodeRandomPingCount_) public onlyOwner {
        require(nodeRandomMinCount_ >= 0 && nodeRandomMinCount_ < vnodes.length);
        require(nodeRandomPingCount_ >= 0 && nodeRandomPingCount_ < vnodes.length);
        nodeRandomMinCount = nodeRandomMinCount_;
        nodeRandomPingCount = nodeRandomPingCount_;
        emit RandomParamsUpdated(nodeRandomMinCount_, nodeRandomPingCount_);
    }

    // ----------------------------- NODE PUBLIC FUNCTIONS  --------------------------------------------------

    /*
    Registers a new V, S, D node
    Locks PUSH tokens ($_token) with $_collateral amount.
    A node will run from a _nodeWallet
    ACCESS: Any node can call this
    */
    function registerNodeAndStake(uint256 nodeTokens_,
        NodeType nodeType_, string memory nodeApiBaseUrl_, address nodeWallet_) public {
        console.log('--register', nodeWallet_);
        // pre-actions
        if (nodeType_ == NodeType.VNode) {
            require(nodeTokens_ >= minStakeV, "Insufficient collateral for VNODE");
            vnodes.push(nodeWallet_);
        } else if (nodeType_ == NodeType.SNode) {
            require(nodeTokens_ >= minStakeS, "Insufficient collateral for SNODE");
            snodes.push(nodeWallet_);
        } else if (nodeType_ == NodeType.DNode) {
            require(nodeTokens_ >= minStakeD, "Insufficient collateral for DNODE");
            dnodes.push(nodeWallet_);
        } else {
            revert("unsupported nodeType ");
        }
        NodeInfo storage old = nodeMap[nodeWallet_];
        if (old.ownerWallet != address(0)) {
            revert("a node with pubKey is already defined");
        }

        // check that collateral is allowed to spend
        if (nodeTokens_ > 0) {
            uint256 allowed = pushToken.allowance(msg.sender, address(this));
            require(allowed >= nodeTokens_, "_nodeTokens cannot be transferred, check allowance");
        }
        // new mapping
        console.log('node owner is ', msg.sender);
        NodeInfo memory n;
        n.ownerWallet = msg.sender;
        n.nodeWallet = nodeWallet_;
        n.nodeType = nodeType_;
        n.nodeTokens = nodeTokens_;
        n.nodeApiBaseUrl = nodeApiBaseUrl_;
        nodeMap[nodeWallet_] = n;
        // take collateral
        if (nodeTokens_ > 0) {
            require(pushToken.transferFrom(msg.sender, address(this), nodeTokens_), "failed to transfer tokens to contract");
        }
        totalStaked += nodeTokens_;

        // post actions
        if (nodeType_ == NodeType.VNode) {
            recalcualteAttestersCountPerBlock();
        } else if (nodeType_ == NodeType.SNode) {
            // try to register this node for shard mappings
            require(storageContract != address(0), 'no storage contract defined');
            StorageV1 s = StorageV1(storageContract);
            s.addNode(nodeWallet_);
        }
        //        MIN_NODES_FOR_REPORT = (uint32)(1 + (nodes.length / 2));
        emit NodeAdded(msg.sender, nodeWallet_, nodeType_, nodeTokens_, nodeApiBaseUrl_);
    }

    // raise the number of required signatures per block
    // from 1 up to attestersTarget
    // or down to 1
    function recalcualteAttestersCountPerBlock() private {
        uint16 activeValidators_ = 0;
        for (uint i = 0; i < vnodes.length; i++) {
            address nodeAddr_ = vnodes[i];
            NodeInfo storage nodeInfo_ = nodeMap[nodeAddr_];
            if (isActiveValidator(nodeInfo_.status)) {
                activeValidators_++;
            }
        }
        vnodesActive = activeValidators_;
        console.log('activeValidators_', activeValidators_);
        uint16 valPerBlock_ = activeValidators_;
        uint16 valPerBlockTarget_ = valPerBlockTarget;
        if (valPerBlock_ > valPerBlockTarget_) {
            valPerBlock_ = valPerBlockTarget_;
            console.log('limit by target', valPerBlockTarget_);
        }
        require(valPerBlock <= valPerBlockTarget_);
        if(valPerBlock_ != valPerBlock) {
            console.log('recalcualteAttestersCountPerBlock', valPerBlock_, valPerBlockTarget_);
            valPerBlock = valPerBlock_;
            emit BlockParamsUpdated(valPerBlock_, valPerBlockTarget_);
        }
    }

    function isActiveValidator(NodeStatus status) private pure returns (bool) {
        return !(status == NodeStatus.Unstaked || status == NodeStatus.BannedAndUnstaked);
    }

    /*
    Remove node (if you are the node owner)
    ACCESS: Any node owner can call this
    */
    function unstakeNode(address nodeWallet_) public {
        console.log('--unstake', nodeWallet_);
        NodeInfo storage node = nodeMap[nodeWallet_];
        require(node.nodeWallet != address(0), "node does not exists");
        require(node.ownerWallet == msg.sender || owner() == msg.sender, "only owner can unstake a node");
        _unstakeNode(node);
        node.status = NodeStatus.Unstaked;
        emit NodeStatusChanged(node.nodeWallet, NodeStatus.Unstaked, 0);
    }

    /* Complain on an existing node;
       N attesters can request to report malicious activity for a specific node
       also slashes if the # of complains meet the required threshold
       example lifecycle: report x 2 -> slash x 2 -> ban
       if all prerequisites match - the contract will execute

       Returns 1 (number of affected nodes) or 0 (if nothing happened)
     */
    // ACCESS: Any node can call this
    function reportNode(NodeType targetNodeType_, bytes memory voteBlob_, bytes[] memory signatures_) public {
        console.log('reportNode()', voteBlob_.length);
        NodeInfo storage reporterNode_ = nodeMap[msg.sender];
        if (reporterNode_.nodeWallet == address(0)) {
            revert('invalid reporter');
        }

        console.log('got signatures', signatures_.length);
        uint uniqVotersSize_ = 0;
        address[] memory uniqVoters_ = new address[](signatures_.length);
        for (uint i = 0; i < signatures_.length; i++) {
            address voterWallet = SigUtil.recoverSignerEx(voteBlob_, signatures_[i]);
            console.log('voter wallet is', voterWallet);
            NodeInfo storage voterNode = nodeMap[voterWallet];
            if (voterNode.nodeWallet == address(0)) {
                console.log('invalid voter wallet');
                continue;
            }
            // this is not very efficient, but there is no in-memory set support
            bool foundDuplicate_ = false;
            for (uint j = 0; j < uniqVotersSize_; j++) {
                if (uniqVoters_[j] == voterWallet) {
                    foundDuplicate_ = true;
                    break;
                }
            }
            if (foundDuplicate_) {
                continue;
            }
            uniqVoters_[uniqVotersSize_++] = voterWallet;
        }
        console.log('sigcount=', uniqVotersSize_);
        // compactify
        if (uniqVotersSize_ < signatures_.length) {
            address[] memory tmp = new address[](uniqVotersSize_);
            for (uint i = 0; i < uniqVotersSize_; i++) {
                tmp[i] = uniqVoters_[i];
            }
            uniqVoters_ = tmp;
        }

        if (targetNodeType_ == NodeType.VNode) {
            // unpack and verify
            uint8 cmd_;
            uint128 blockId_;
            address targetNodeAddr_;
            (cmd_, blockId_, targetNodeAddr_) = abi.decode(voteBlob_, (uint8, uint128, address));

            require(cmd_ == uint8(VoteAction.ReportV), 'report action only supported');
            NodeInfo storage targetNode_ = nodeMap[targetNodeAddr_];
            require(targetNode_.nodeWallet != address(0), "target node wallet does not exists");
            require(targetNode_.nodeType == NodeType.VNode, "report only for VNodes");

            _reportVNode(VoteAction(cmd_), reporterNode_, uniqVoters_, targetNode_, blockId_);
        } else if (targetNodeType_ == NodeType.SNode) {
            uint8 cmd_;
            uint128 blockId_;
            address targetNodeAddr_;
            uint128 skey_;
            (cmd_, blockId_, targetNodeAddr_, skey_) = abi.decode(voteBlob_, (uint8, uint128, address, uint128));

            require(cmd_ == uint8(VoteAction.ReportS), 'report action only supported');
            NodeInfo storage targetNode_ = nodeMap[targetNodeAddr_];
            require(targetNode_.nodeWallet != address(0), "target node wallet does not exists");
            require(targetNode_.nodeType == NodeType.SNode, "report only for SNodes");
            _reportSNode(VoteAction(cmd_), reporterNode_, uniqVoters_, targetNode_, blockId_, skey_);
        }

    }

    function getVNodesLength() public view returns (uint) {
        return vnodes.length;
    }

    function getVNodes() public view returns (address[] memory) {
        return vnodes;
    }

    function getSNodesLength() public view returns (uint) {
        return snodes.length;
    }

    function getSNodes() public view returns (address[] memory) {
        return snodes;
    }

    function getDNodesLength() public view returns (uint) {
        return dnodes.length;
    }

    function getDNodes() public view returns (address[] memory) {
        return dnodes;
    }

    // ----------------------------- IMPL  --------------------------------------------------


    // note: reading storage value multiple times which is sub-optimal, but the code looks much simpler
    function _reportVNode(VoteAction voteAction_, NodeInfo storage reporterNode,
        address[] memory uniqVoters_, NodeInfo storage targetNode, uint128 blockId_
    ) private returns (uint8) {
        require(targetNode.nodeType == NodeType.VNode, "report only for VNodes");
        if (uniqVoters_.length < valPerBlock * REPORT_THRESHOLD_PER_BLOCK / 100) {
            revert('sig count is too low');
        }
        NodeStatus ns_ = targetNode.status;
        if (ns_ == NodeStatus.Unstaked || ns_ == NodeStatus.BannedAndUnstaked) {
            // this is a terminal state
            return 0;
        }

        reportIfNew(voteAction_, reporterNode, targetNode, uniqVoters_, blockId_, 0);

        if (targetNode.counters.reportCounter >= REPORTS_BEFORE_SLASH_V) {
            slash(reporterNode, targetNode);
        }
        if (targetNode.counters.slashCounter >= SLASHES_BEFORE_BAN_V) {
            ban(targetNode);
        }
        return 0;
    }

    function _reportSNode(VoteAction voteAction_, NodeInfo storage reporterNode, address[] memory uniqVoters_,
        NodeInfo storage targetNode, uint128 blockId_, uint128 storageKey_) private returns (uint8) {
        require(targetNode.nodeType == NodeType.SNode, "report only for SNodes");
        if (uniqVoters_.length < valPerBlock * REPORT_THRESHOLD_PER_BLOCK / 100) {
            revert('sig count is too low');
        }
        NodeStatus ns_ = targetNode.status;
        if (ns_ == NodeStatus.Unstaked || ns_ == NodeStatus.BannedAndUnstaked) {
            // this is a terminal state
            return 0;
        }

        reportIfNew(voteAction_, reporterNode, targetNode, uniqVoters_, blockId_, storageKey_);

        if (targetNode.counters.reportCounter >= REPORTS_BEFORE_SLASH_S) {
            slash(reporterNode, targetNode);
        }
        if (targetNode.counters.slashCounter >= SLASHES_BEFORE_BAN_S) {
            ban(targetNode);
        }
        return 0;
    }

    /*
     Returns remaining collateral
    */
    function reduceCollateral(NodeInfo storage slashedNode, uint32 percentage_
    ) private returns (uint256 newAmount_, uint256 delta_) {
        require(percentage_ >= 0 && percentage_ <= 100, "percentage should be in [0, 100]");
        // reduce only nodeTokens; we do not transfer any tokens; it will affect only 'unstake'
        uint256 currentAmount_ = slashedNode.nodeTokens;
        newAmount_ = (currentAmount_ * (100 - percentage_)) / 100;
        delta_ = currentAmount_ - newAmount_;
        slashedNode.nodeTokens = newAmount_;
        return (newAmount_, delta_);
    }

    // remove value from nodes array, preserving space
    function findAndRemove(address[] storage addrArray, address addrToRemove) private returns (bool) {
        uint len_ = addrArray.length;
        for (uint i = 0; i < len_; i++) {
            if (addrArray[i] == addrToRemove) {
                if (i != len_ - 1) {
                    addrArray[i] = addrArray[len_ - 1];
                }
                addrArray.pop();
                return true;
            }
        }
        return false;
    }

    /*
    Returns unstaked amount
    */
    function _unstakeNode(NodeInfo storage targetNode_) private returns (uint256) {
        uint256 delta = targetNode_.nodeTokens;
        require(pushToken.transfer(targetNode_.ownerWallet, delta), "failed to trasfer funds back to owner");
        targetNode_.nodeTokens = 0;
        totalStaked -= delta;
        if (targetNode_.nodeType == NodeType.VNode) {
            delete targetNode_.counters.reportedInBlocks;
            delete targetNode_.counters.reportedBy;
            findAndRemove(vnodes, targetNode_.nodeWallet);
            recalcualteAttestersCountPerBlock(); // only after vnodes got shrinked
        } else if (targetNode_.nodeType == NodeType.SNode) {
            require(storageContract != address(0), 'no storage contract defined');
            StorageV1 s = StorageV1(storageContract);
            s.removeNode(targetNode_.nodeWallet);
            delete targetNode_.counters.reportedInBlocks;
            delete targetNode_.counters.reportedBy;
            delete targetNode_.counters.reportedKeys;
            findAndRemove(snodes, targetNode_.nodeWallet);
        }
        return delta;
    }

    function decodeVoteMessage(bytes memory data) private pure returns (VoteMessage memory) {
        VoteMessage memory result;
        (result.blockId, result.targetNode, result.voteAction) = abi.decode(data, (uint128, address, uint8));
        return result;
    }

    function getNodeInfo(address _nodeWallet) public view returns (NodeInfo memory) {
        return nodeMap[_nodeWallet];
    }


    /*
    A reporterNode reports on targetNode, targetNode can be V or S node
    newVoters_ - who voted (set)
    blockId_ - blockId which is used to do this report
    storageKey_ - only for storage nodes ( that's a report that a node has no key)
    */
    function reportIfNew(VoteAction voteAction_,
        NodeInfo storage reporterNode,
        NodeInfo storage targetNode,
        address[] memory newVoters_,
        uint128 blockId_,
        uint128 storageKey_
    ) private {
        console.log('doReport');

        // check that we encounter this report X this block only for the first time
        uint128[] memory reportedInBlocks_ = targetNode.counters.reportedInBlocks;
        uint ribLen_ = reportedInBlocks_.length;
        for (uint i = 0; i < ribLen_; i++) {
            if (blockId_ == reportedInBlocks_[i]) {
                revert('block is not new');
            }
        }

        if (targetNode.nodeType == NodeType.SNode) {
            require(storageKey_ != 0, 'storage key is required');
            uint128[] memory reportedKeys_ = targetNode.counters.reportedKeys;
            uint rkLen_ = reportedKeys_.length;
            for (uint i = 0; i < rkLen_; i++) {
                if (storageKey_ == reportedKeys_[i]) {
                    revert('storage key is not new');
                }
            }
            targetNode.counters.reportedKeys.push(storageKey_);
            console.log('targetNode added skey', storageKey_);
        }


        targetNode.counters.reportCounter++;
        targetNode.counters.reportedInBlocks.push(blockId_);
        console.log('targetNode wallet', targetNode.nodeWallet);
        console.log('targetNode added blockId', blockId_);

        // calculate new voters; they will collectively split payments on slash
        address[] memory reportedBy_ = targetNode.counters.reportedBy;
        uint rbLen_ = reportedBy_.length;
        for (uint n = 0; n < newVoters_.length; n++) {
            for (uint k = 0; k < rbLen_; k++) {
                if (newVoters_[n] == reportedBy_[k] && newVoters_[n] != address(0)) {
                    newVoters_[n] = address(0);
                    break;
                }
            }
        }
        for (uint n = 0; n < newVoters_.length; n++) {
            address voter_ = newVoters_[n];
            if (voter_ != address(0)) {
                targetNode.counters.reportedBy.push(newVoters_[n]);
            }
        }

        if(targetNode.status == NodeStatus.OK) {
            targetNode.status = NodeStatus.Reported;
        }
        emit NodeReported(targetNode.nodeWallet, reporterNode.nodeWallet, newVoters_, voteAction_); // todo do we need this ?
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.Reported, targetNode.nodeTokens);
    }

    function slash(NodeInfo storage reporterNode, NodeInfo storage targetNode) private {
        console.log('doSlash');
        // targetNode gets slashed by SLASH_PERCENT, this deducts delta_ tokens
        uint256 coll_;
        uint256 delta_;
        (coll_, delta_) = reduceCollateral(targetNode, SLASH_PERCENT);

        // every pre-exising-signed-reporter will get a slice of the bonus
        address[] memory reportedBy_ = targetNode.counters.reportedBy;
        uint256 reporterBonus_;
        if (delta_ > 0 && reportedBy_.length > 0) {
            reporterBonus_ = delta_ / reportedBy_.length;
            console.log('reporter bonus=', reporterBonus_);
            require(reporterBonus_ >= 0, 'negative bonus');
            for (uint i = 0; i < reportedBy_.length; i++) {
                NodeInfo storage ni = nodeMap[reportedBy_[i]];
                if (ni.ownerWallet == address(0)) {
                    continue;
                }
                ni.nodeTokens += reporterBonus_;
                delta_ -= reporterBonus_;
                require(delta_ >= 0, 'positive delta');
            }
        }
        // reporter will get the remaing points (less that reporterBonus)
        reporterNode.nodeTokens += delta_;


        delete targetNode.counters.reportedBy;
        if(targetNode.status == NodeStatus.OK || targetNode.status == NodeStatus.Reported) {
            targetNode.status = NodeStatus.Slashed;
        }
        targetNode.counters.reportCounter = 0;
        targetNode.counters.slashCounter++;
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.Slashed, coll_);
    }

    function ban(NodeInfo storage targetNode) private {
        uint256 coll_;
        uint256 delta_;
        (coll_, delta_) = reduceCollateral(targetNode, BAN_PERCENT);
        totalStaked -= delta_;
        totalFees += delta_;
        _unstakeNode(targetNode);
        targetNode.status = NodeStatus.BannedAndUnstaked;
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.BannedAndUnstaked, 0);
    }

}

// a lib that abstracts privKey signature and pubKey+signature checks
library SigUtil {

    function getMessageHash(bytes memory _message) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_message));
    }

    function getEthSignedMessageHash(bytes32 _messageHash) internal pure returns (bytes32) {
        /*
        Signature is produced by signing a keccak256 hash with the following format:
        "\x19Ethereum Signed Message\n" + len(msg) + msg
        */
        return
            keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash)
        );
    }

    function recoverSigner(
        bytes32 _ethSignedMessageHash,
        bytes memory _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");

        assembly {
        /*
        First 32 bytes stores the length of the signature

        add(sig, 32) = pointer of sig + 32
        effectively, skips first 32 bytes of signature

        mload(p) loads next 32 bytes starting at the memory address p into memory
        */

        // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
        // second 32 bytes
            s := mload(add(sig, 64))
        // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        // implicitly return (r, s, v)
    }

    function recoverSignerEx(bytes memory _message, bytes memory _signature
    ) internal pure returns (address) {
        bytes32 messageHash = getMessageHash(_message);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);
        return recoverSigner(ethSignedMessageHash, _signature);
    }

}