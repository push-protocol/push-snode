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
    uint32 public REPORT_THRESHOLD;       // i.e. 66 = 66% = 2/3
    uint32 public REPORTS_BEFORE_SLASH;   // todo should be 10 for V and 50 for S nodes

    /*
    slash = reduces node collateral for SLASH_PERCENT %

    after SLASH_BEFORE_BAN iterations, the node would get a ban
    ban = reduces node collateral for BAN_PERCENT, node address is banned forever
    */
    uint32 public SLASH_PERCENT;
    uint32 public SLASHES_BEFORE_BAN; // todo should be 5?

    uint32 public BAN_PERCENT;

    /* validator validation params  (effectively constant only for V backend)
    these parameters control how nodejs processes communicate
    for the contract these a simply constants; all the logic is in JS
    */

    // attestersRequired should group up to attestersTarget, when new nodes join
    uint8 public attestersTarget;

    /*
    how many signatures is needed for a block

       A block gets signed by a validator + N attesters
       numberOfSignatures = attestersCountPerBlock (maxed by attersterTarget)

       if REPORT_PERCENT is 66% ( 2/3 of signers should agree on a block)
       3 * 67 / 100 = 201 / 100 = 2
       if we have at least 2 valid signatures out of 3 - that's a good block

       attestersCountPerBlock would grow as more nodes join the network;
       up to attestersTarget
    */
    uint8 public attestersCountPerBlock;
    // how many networkRandom objects are required to compute a random value
    uint8 public nodeRandomMinCount;
    // how many nodes should see the emitter of that networkRandom ; so that we could count on this network random
    uint8 public nodeRandomPingCount;

    // ----------------------------- CONTRACT STATE --------------------------------------------------

    /* registered nodes params */

    // push token used for staking/slashing etc
    IERC20 pushToken;

    // storage contract manages storage node state
    address public storageContract;

    // node colleciton
    address[] public nodes;       // todo split into 3 arrays based on type
    mapping(address => NodeInfo) public nodeMap;

    // push tokens owned by this contract; which have an owner
    uint public totalStaked;

    // push tokens owned by this contract;
    // comes from penalties from BAN only;
    // SLASH benefits the voters
    uint public totalUnstaked;

    // ----------------------------- EVENTS  --------------------------------------------------
    event NodeAdded(address indexed ownerWallet, address indexed nodeWallet, NodeType nodeType, uint256 nodeTokens, string nodeApiBaseUrl);
    event NodeStatusChanged(address indexed nodeWallet, NodeStatus nodeStatus, uint256 nodeTokens);
    event NodeReported(address nodeWallet, address reporterWallet, address[] voters, VoteAction voteAction);

    event AttestersRequiredUpdated(uint32 value);
    event NodeRandomMinCountUpdated(uint32 value);
    event NodeRandomPingCountUpdated(uint32 value);

    // ----------------------------- TYPES  --------------------------------------------------

    struct NodeInfo {
        address ownerWallet;
        address nodeWallet;       // eth wallet
        NodeType nodeType;
        uint256 nodeTokens;
        string nodeApiBaseUrl; // rest api url for invocation
        NodeCounters counters;
        NodeStatus status;
    }

    struct NodeCounters {
        uint16 reportCounter; // how many times this node was reported
        uint16 slashCounter;

        // block numbers where this node was reported (cleaned on BAN)
        uint128[] reportedInBlocks;
        // addresses who did the reports (they will receive slash rewards) (cleaned on SLASH)
        address[] reportedBy;
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
        Report
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
        uint8 attestersTarget_,
        uint8 nodeRandomMinCount_,
        uint8 nodeRandomPingCount_
    ) initializer public {
        // init libraries
        __UUPSUpgradeable_init();
        __Ownable_init_unchained();
        // init state
        protocolVersion = protocolVersion_;
        require(pushToken_ != address(0));
        pushToken = IERC20(pushToken_);
        require(attestersTarget_ > 0, "invalid attesters amount");
        attestersTarget = attestersTarget_;
        require(nodeRandomMinCount_ > 0, "invalid nodeRandomMinCount amount");
        nodeRandomMinCount = nodeRandomMinCount_;
        require(nodeRandomPingCount_ > 0, "invalid nodeRandomFilterPingsRequired amount");
        nodeRandomPingCount = nodeRandomPingCount_;

        minStakeV = 100;
        minStakeS = 100;
        minStakeD = 100;
        REPORTS_BEFORE_SLASH = 2;
        SLASH_PERCENT = 1;
        SLASHES_BEFORE_BAN = 2;
        BAN_PERCENT = 10;


        REPORT_THRESHOLD = 66;
        attestersCountPerBlock = 0;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function getProtocolVersion() public view returns (uint16) {
        return protocolVersion;
    }

    function getCodeVersion() public pure returns (uint16){
        return 2;
    }
    // ----------------------------- ADMIN FUNCTIONS --------------------------------------------------

    function setStorageContract(address addr_) public onlyOwner {
        storageContract = addr_;
    }

    function updateAttestersCountPerBlock(uint8 val_) public onlyOwner {
        _updateAttestersCountPerBlock(val_);
    }

    function updateNodeRandomMinCount(uint8 val_) public onlyOwner {
        require(val_ >= 0 && val_ < nodes.length);
        nodeRandomMinCount = val_;
        emit NodeRandomMinCountUpdated(val_);
    }

    function updateNodeRandomPingCount(uint8 val_) public onlyOwner {
        require(val_ >= 0 && val_ < nodes.length);
        nodeRandomPingCount = val_;
        emit NodeRandomPingCountUpdated(val_);
    }

    // ----------------------------- NODE PUBLIC FUNCTIONS  --------------------------------------------------

    /*
    Registers a new validator node
    Locks PUSH tokens ($_token) with $_collateral amount.
    A node will run from a _nodeWallet
    ACCESS: Any node can call this
    */
    function registerNodeAndStake(uint256 nodeTokens_,
        NodeType nodeType_, string memory nodeApiBaseUrl_, address nodeWallet_) public {
        uint256 coll = nodeTokens_;
        if (nodeType_ == NodeType.VNode) {
            require(coll >= minStakeV, "Insufficient collateral for VNODE");
        } else if (nodeType_ == NodeType.DNode) {
            require(coll >= minStakeD, "Insufficient collateral for DNODE");
        } else if (nodeType_ == NodeType.SNode) {
            require(coll >= minStakeS, "Insufficient collateral for SNODE");
        } else {
            revert("unsupported nodeType ");
        }
        NodeInfo storage old = nodeMap[nodeWallet_];
        if (old.ownerWallet != address(0)) {
            revert("a node with pubKey is already defined");
        }
        // check that collateral is allowed to spend
        uint256 allowed = pushToken.allowance(msg.sender, address(this));
        require(allowed >= nodeTokens_, "_nodeTokens cannot be transferred, check allowance");
        // new mapping
        console.log('node owner is ', msg.sender);
        NodeInfo memory n;
        n.ownerWallet = msg.sender;
        n.nodeWallet = nodeWallet_;
        n.nodeType = nodeType_;
        n.nodeTokens = coll;
        n.nodeApiBaseUrl = nodeApiBaseUrl_;
        nodes.push(nodeWallet_);
        nodeMap[nodeWallet_] = n;
        // take collateral
        require(pushToken.transferFrom(msg.sender, address(this), coll), "failed to transfer tokens to contract");
        totalStaked += coll;
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
        emit NodeAdded(msg.sender, nodeWallet_, nodeType_, coll, nodeApiBaseUrl_);
    }

    // raise the number of required signatures per block
    // from 1 up to attestersTarget
    // or down to 1
    function recalcualteAttestersCountPerBlock() private {
        uint activeValidators_ = 0;
        for (uint i = 0; i < nodes.length; i++) {
            address nodeAddr_ = nodes[i];
            NodeInfo storage nodeInfo_ = nodeMap[nodeAddr_];
            if (nodeInfo_.nodeType == NodeType.VNode && isActiveValidator(nodeInfo_.status)) {
                activeValidators_++;
            }
        }
        uint newValue = activeValidators_;
        if (attestersCountPerBlock > attestersTarget) {
            newValue = attestersTarget;
        }
        _updateAttestersCountPerBlock(uint8(newValue));
    }

    function isActiveValidator(NodeStatus status) private pure returns (bool) {
        return status == NodeStatus.Unstaked || status == NodeStatus.BannedAndUnstaked;
    }

    /*
    Remove node (if you are the node owner)
    ACCESS: Any node can call this
    */
    function unstakeNode(address nodeWallet_) public {
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
    function reportNode(bytes memory voteBlob_,
        bytes[] memory signatures_) public {
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
        if (uniqVotersSize_ < attestersCountPerBlock * REPORT_THRESHOLD / 100) {
            revert('sig count is too low');
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

        // unpack and verify
        VoteMessage memory vm_;
        uint128 _blockId;
        address _targetNode;
        uint8 _voteAction;
        (_blockId, _targetNode, _voteAction) = abi.decode(voteBlob_, (uint128, address, uint8));

        require(_voteAction == uint8(VoteAction.Report), 'report action only supported');
        NodeInfo storage targetNode_ = nodeMap[_targetNode];
        require(targetNode_.nodeWallet != address(0), "target node wallet does not exists");
        require(targetNode_.nodeType == NodeType.VNode, "report only for VNodes");

        _reportNode(vm_, reporterNode_, uniqVoters_, targetNode_);
    }

    // ----------------------------- IMPL  --------------------------------------------------


    function _updateAttestersCountPerBlock(uint8 val_) private {
        require(val_ >= 0 && val_ < nodes.length);
        if (val_ == attestersCountPerBlock) {
            return;
        }
        attestersCountPerBlock = val_;
        emit AttestersRequiredUpdated(val_);
    }

    // note: reading storage value multiple times which is sub-optimal, but the code looks much simpler
    function _reportNode(VoteMessage memory _vm,
        NodeInfo storage reporterNode,
        address[] memory uniqVoters_,
        NodeInfo storage targetNode) private returns (uint8){
        require(targetNode.nodeType == NodeType.VNode, "report only for VNodes");
        NodeStatus ns = targetNode.status;
        // 2 check count
        if (_vm.voteAction == uint8(VoteAction.Report)) {
            doReportIfBlockIsNew(reporterNode, uniqVoters_, _vm.blockId, targetNode);
        } else {
            revert("unsupported");
        }
        if (ns == NodeStatus.OK || ns == NodeStatus.Slashed) {
            if (targetNode.counters.reportCounter >= REPORTS_BEFORE_SLASH) {
                doSlash(reporterNode, targetNode);
            }
            if (targetNode.counters.slashCounter >= SLASHES_BEFORE_BAN) {
                doBan(targetNode);
            }
        } else if (ns == NodeStatus.BannedAndUnstaked) {
            // do nothing; terminal state
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

    /*
    Returns unstaked amount
    */
    function _unstakeNode(NodeInfo storage targetNode_) private returns (uint256){
        uint256 delta = targetNode_.nodeTokens;
        require(pushToken.transfer(targetNode_.ownerWallet, delta), "failed to trasfer funds back to owner");
        targetNode_.nodeTokens = 0;
        totalStaked -= delta;
        if (targetNode_.nodeType == NodeType.VNode) {
            recalcualteAttestersCountPerBlock();
            delete targetNode_.counters.reportedInBlocks;
            delete targetNode_.counters.reportedBy;
        } else if (targetNode_.nodeType == NodeType.SNode) {
            require(storageContract != address(0), 'no storage contract defined');
            StorageV1 s = StorageV1(storageContract);
            s.removeNode(targetNode_.nodeWallet);
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

    function getNodes() public view returns (address[] memory) {
        return nodes;
    }

    // alters newVoters_ !
    // reportedInBlocks, reportedBy - arrays are used for a reason
    // to be more compact and to clean easier later.
    function doReportIfBlockIsNew(NodeInfo storage reporterNode, address[] memory newVoters_,
                                  uint128 blockId_, NodeInfo storage targetNode
    ) private {
        console.log('doReport');

        // check that we encounter this report X this block only for the first time
        uint128[] memory knownBlocks = targetNode.counters.reportedInBlocks;
        for (uint i = 0; i < knownBlocks.length; i++) {
            if (blockId_ == knownBlocks[i]) {
                revert('block is not new');
            }
        }
        targetNode.counters.reportCounter++;
        targetNode.counters.reportedInBlocks.push(blockId_);

        // calculate new voters; they will collectively split payments on slash
        address [] memory knownVoters = targetNode.counters.reportedBy;
        for (uint n = 0; n < newVoters_.length; n++) {
            for (uint k = 0; k < knownVoters.length; k++) {
                if (newVoters_[n] == knownVoters[k] && newVoters_[n] != address(0)) {
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


        emit NodeReported(targetNode.nodeWallet, reporterNode.nodeWallet, newVoters_, VoteAction.Report); // todo do we need this ?
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.Reported, targetNode.nodeTokens);
    }

    function doSlash(NodeInfo storage reporterNode, NodeInfo storage targetNode) private {
        console.log('doSlash');
        // targetNode gets slashed by SLASH_PERCENT, this deducts delta_ tokens
        uint256 coll_;
        uint256 delta_;
        (coll_, delta_) = reduceCollateral(targetNode, SLASH_PERCENT);

        // every pre-exising-signed-reporter will get a slice of the bonus
        address[] memory reportedBy_ = targetNode.counters.reportedBy;
        uint256 reporterBonus_;
        reporterBonus_ = delta_ / (reportedBy_.length + 1);
        for (uint i = 0; i < reportedBy_.length; i++) {
            NodeInfo storage ni = nodeMap[reportedBy_[i]];
            if (ni.ownerWallet == address(0)) {
                continue;
            }
            ni.nodeTokens += reporterBonus_;
            delta_ -= reporterBonus_;
        }
        // current reporter will get a slice of the bonus (so he gets 2xbonus)
        reporterNode.nodeTokens += delta_; // reporter gets slashed profils


        delete targetNode.counters.reportedBy;
        targetNode.status = NodeStatus.Slashed;
        targetNode.counters.reportCounter = 0;
        targetNode.counters.slashCounter++;
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.Slashed, coll_);
    }

    function doBan(NodeInfo storage targetNode) private {
        uint256 coll_;
        uint256 delta_;
        (coll_, delta_) = reduceCollateral(targetNode, BAN_PERCENT);
        totalStaked -= delta_;
        totalUnstaked += delta_;
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