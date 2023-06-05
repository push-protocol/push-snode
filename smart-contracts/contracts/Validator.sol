//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/*
Validator smart contract

Enables a network of Validators
*/
contract ValidatorV1 is Ownable2StepUpgradeable, UUPSUpgradeable {

    uint16 private protocolVersion;

    // contract-wide variables
    uint256 public vnodeCollateralInPushTokens;
    uint32 public REPORT_COUNT_TO_SLASH;
    uint32 public SLASH_COLL_PERCENTAGE;
    uint32 public SLASH_COUNT_TO_BAN;
    uint32 public BAN_COLL_PERCENTAGE;
    uint32 public MIN_NODES_FOR_REPORT;

    // backend-wide variables
    // how many attesters should sign the message block, after validator proposes a block
    uint8 public attestersRequired;
    // how many networkRandom objects are required to compute a random value
    uint8 public nodeRandomMinCount;
    // how many nodes should see the emitter of that networkRandom ; so that we could count on this network random
    uint8 public nodeRandomPingCount;



    // token storages
    IERC20 pushToken;

    // node colleciton
    address[] nodes;
    mapping(address => NodeInfo) nodeMap; // nodeWallet -> node info
    uint256 totalStaked;      // push tokens owned by this contract; which have an owner
    uint256 totalPenalties;   // push tokens owned by this contract; comes from penalties

    /* EVENTS */
    event NodeAdded(address indexed ownerWallet, address indexed nodeWallet, NodeType nodeType, uint256 nodeTokens, string nodeApiBaseUrl);
    event NodeStatusChanged(address indexed nodeWallet, NodeStatus nodeStatus, uint256 nodeTokens);

    event AttestersRequiredUpdated(uint32 value);
    event NodeRandomMinCountUpdated(uint32 value);
    event NodeRandomPingCountUpdated(uint32 value);

    /* TYPES */


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
        uint16 reportCounter;
        uint16 slashCounter;
    }

    struct Vote {
        uint256 ts;
        address[] voters; // this is not the node which decided to vote, this is the one who reported
        // a message, signed by X other nodes
        address target;
        VoteAction voteAction;
    }

    enum NodeStatus {
        OK, // this node operates just fine (DEFAULT VALUE)
        Reported, // he have a few malicious reports
        Slashed, // we already slashed this node at least once (normally we will take -2% of collateral tokens)
        BannedAndUnstaked, // we banned the node and unstaked it's tokens (normally we will take -10% of collateral tokens)
        Unstaked
    }

    enum VoteAction {
        Report
        //        Slash,
        //        Ban
    }

    enum NodeType {
        VNode, // validator 0
        SNode, // storage 1
        DNode  // delivery 2
    }

    struct VoteMessage {
        VoteAction vote;
        address target;
    }

    /* METHODS */

    function decodeVoteMessage(bytes memory data) private pure returns (VoteMessage memory) {
        (VoteAction vote, address target) = abi.decode(data, (VoteAction, address));
        VoteMessage memory result;
        result.vote = vote;
        result.target = target;
        return result;
    }

    // an empty constructor; constructor is replaced with initialize()
    constructor() {
    }

    // called only once when a proxy gets deployed; for updates use reinitializer
    function initialize(
        uint16 protocolVersion_,
        address pushToken_,
        uint8 attestersRequired_,
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
        require(attestersRequired_ > 0, "invalid attesters amount");
        attestersRequired = attestersRequired_;
        require(nodeRandomMinCount_ > 0, "invalid nodeRandomMinCount amount");
        nodeRandomMinCount = nodeRandomMinCount_;
        require(nodeRandomPingCount_ > 0, "invalid nodeRandomFilterPingsRequired amount");
        nodeRandomPingCount = nodeRandomPingCount_;

        vnodeCollateralInPushTokens = 100;
        REPORT_COUNT_TO_SLASH = 2;
        SLASH_COLL_PERCENTAGE = 1;
        SLASH_COUNT_TO_BAN = 2;
        BAN_COLL_PERCENTAGE = 10;
        MIN_NODES_FOR_REPORT = 1;
        // todo update this on node join
    }

    // Registers a new validator node
    // Locks PUSH tokens ($_token) with $_collateral amount.
    // A node will run from a _nodeWallet
    function registerNodeAndStake(uint256 _nodeTokens,
        NodeType _nodeType, string memory _nodeApiBaseUrl, address _nodeWallet) public {
        uint256 coll = _nodeTokens;
        if (_nodeType == NodeType.VNode) {
            require(coll >= vnodeCollateralInPushTokens, "Insufficient collateral for VNODE");
        } else if(_nodeType == NodeType.DNode) {
            require(coll >= vnodeCollateralInPushTokens, "Insufficient collateral for DNODE");
        } else {
            revert("unsupported nodeType ");
        }
        NodeInfo storage old = nodeMap[_nodeWallet];
        if (old.ownerWallet != address(0)) {
            revert("a node with pubKey is already defined");
        }
        // check that collateral is allowed to spend
        uint256 allowed = pushToken.allowance(msg.sender, address(this));
        require(allowed >= _nodeTokens, "_nodeTokens cannot be transferred, check allowance");
        // new mapping
        NodeInfo memory n;
        n.ownerWallet = msg.sender;
        n.nodeWallet = _nodeWallet;
        n.nodeType = _nodeType;
        n.nodeTokens = coll;
        n.nodeApiBaseUrl = _nodeApiBaseUrl;
        nodes.push(_nodeWallet);
        nodeMap[_nodeWallet] = n;
        // take collateral
        require(pushToken.transferFrom(msg.sender, address(this), coll), "failed to transfer tokens to contract");
        totalStaked += coll;
        // post actions
        //        MIN_NODES_FOR_REPORT = (uint32)(1 + (nodes.length / 2));
        emit NodeAdded(msg.sender, _nodeWallet, _nodeType, coll, _nodeApiBaseUrl);
    }



    /* Complain on an existing node;
       N attesters can request to report malicious activity for a specific node
       also slashes if the # of complains meet the required threshold
       example lifecycle: report x 2 -> slash x 2 -> ban
       if all prerequisites match - the contract will execute

       Returns 1 (number of affected nodes) or 0 (if nothing happened)
     */
    function reportNode(bytes memory _message, bytes[] memory _signatures) public returns (uint8) {
        uint validSigCount = 0;
        NodeInfo storage callerNodeId = nodeMap[msg.sender];
        if (callerNodeId.nodeWallet == address(0)) {
            return 0;
        }
        for (uint i = 0; i < _signatures.length; i++) {
            address nodeWallet = SigUtil.recoverSignerEx(_message, _signatures[i]);
            NodeInfo storage voterNode = nodeMap[nodeWallet];
            if (voterNode.nodeWallet != address(0)) {
                validSigCount++;
            }
        }
        if (validSigCount < MIN_NODES_FOR_REPORT) {
            return 0;
        }
        VoteMessage memory vm = decodeVoteMessage(_message);
        // always Report
        NodeInfo storage targetNode = nodeMap[vm.target];
        if (targetNode.nodeWallet == address(0)) {
            revert("a node with _targetPubKey does not exists");
        }
        return doReportNode(vm, targetNode);
    }

    // note: reading storage value multiple times which is sub-optimal, but the code looks much simpler
    function doReportNode(VoteMessage memory _vm, NodeInfo storage targetNode) private returns (uint8){
        require(targetNode.nodeType == NodeType.VNode, "report only for VNodes");
        NodeStatus ns = targetNode.status;
        // 2 check count
        if (_vm.vote == VoteAction.Report) {
            doReport(targetNode);
        } else {
            revert("unsupported");
        }
        if (ns == NodeStatus.OK || ns == NodeStatus.Slashed) {
            if (targetNode.counters.reportCounter >= REPORT_COUNT_TO_SLASH) {
                doSlash(targetNode);
            }
            if (targetNode.counters.slashCounter >= SLASH_COUNT_TO_BAN) {
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
    function reduceCollateral(address _nodeWallet, uint32 _percentage) private returns (uint256) {
        require(_nodeWallet != address(0));
        require(_percentage >= 0 && _percentage <= 100, "percentage should be in [0, 100]");
        // reduce only nodeTokens; we do not transfer any tokens; it will affect only 'unstake'
        NodeInfo storage node = nodeMap[_nodeWallet];
        uint256 currentAmount = node.nodeTokens;
        uint256 newAmount = (currentAmount * (100 - _percentage)) / 100;
        uint256 delta = currentAmount - newAmount;
        node.nodeTokens = newAmount;
        totalStaked -= delta;
        totalPenalties += delta;
        return newAmount;
    }


    function unstakeNode(address _nodeWallet) external {
        NodeInfo storage node = nodeMap[_nodeWallet];
        require(node.nodeWallet != address(0), "node does not exists");
        require(node.ownerWallet == msg.sender, "only owner can unstake a node");
        doUnstake(node);
        node.status = NodeStatus.Unstaked;
        emit NodeStatusChanged(node.nodeWallet, NodeStatus.Unstaked, 0);
    }

    /*
    Returns unstaked amount
    */
    function doUnstake(NodeInfo storage targetNode) private returns (uint256){
        uint256 delta = targetNode.nodeTokens;
        require(pushToken.transfer(targetNode.ownerWallet, delta), "failed to trasfer funds back to owner");
        targetNode.nodeTokens = 0;
        totalStaked -= delta;
        return delta;
    }

    function getNodeInfo(address _nodeWallet) public view returns (NodeInfo memory) {
        return nodeMap[_nodeWallet];
    }

    function getNodes() public view returns (address[] memory) {
        return nodes;
    }

    function doReport(NodeInfo storage targetNode) private {
        targetNode.counters.reportCounter++;
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.Reported, targetNode.nodeTokens);
    }

    function doSlash(NodeInfo storage targetNode) private {
        targetNode.status = NodeStatus.Slashed;
        targetNode.counters.reportCounter = 0;
        targetNode.counters.slashCounter++;
        uint256 coll = reduceCollateral(targetNode.nodeWallet, SLASH_COLL_PERCENTAGE);
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.Slashed, coll);
    }

    function doBan(NodeInfo storage targetNode) private {
        reduceCollateral(targetNode.nodeWallet, BAN_COLL_PERCENTAGE);
        doUnstake(targetNode);
        targetNode.status = NodeStatus.BannedAndUnstaked;
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.BannedAndUnstaked, 0);
    }


    /*****************/
    /* UUPS required */
    /*****************/

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function getProtocolVersion() public view returns (uint16) {
        return protocolVersion;
    }

    function getCodeVersion() public pure returns (uint16){
        return 2;
    }

    function updateAttestersRequired(uint8 amount) public onlyOwner {
        require(amount >= 0 && amount < nodes.length);
        attestersRequired = amount;
        emit AttestersRequiredUpdated(amount);
    }

    function updateNodeRandomMinCount(uint8 amount) public onlyOwner {
        require(amount >= 0 && amount < nodes.length);
        nodeRandomMinCount = amount;
        emit NodeRandomMinCountUpdated(amount);
    }

    function updateNodeRandomPingCount(uint8 amount) public onlyOwner {
        require(amount >= 0 && amount < nodes.length);
        nodeRandomPingCount = amount;
        emit NodeRandomPingCountUpdated(amount);
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

    /**********/
    /* Errors */
    /**********/

    // todo if(!condition) revert Error1();
    // this produces smaller bytecode
    error Error1();

}