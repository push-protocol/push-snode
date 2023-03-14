//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;


// a mock interface of a PUSH token; only bare minimum is needed
interface IPush {
    // allow spender to spend rawAmount on behalf of the caller
    function approve(address spender, uint rawAmount) external returns (bool);
    // checks allowance limit set by approve
    function allowance(address account, address spender) external view returns (uint);
    // transfer allowed tokens (for src)
    function transferFrom(address src, address dst, uint rawAmount) external returns (bool);
    // transfer allowed tokens (for current contract)
    function transfer(address dst, uint rawAmount) external returns (bool);
}

contract Ownable {
    address public owner;
    address public newOwner;

    function transferOwnership(address _newOwner) external {
        require(_newOwner != owner, "Cannot transfer ownership to the current owner.");
        require(msg.sender == owner, "Only the owner can transfer ownership.");
        require(_newOwner != address(0), "Cannot transfer ownership to address(0)");
        newOwner = _newOwner;
        emit LogTransferOwnership(msg.sender, block.timestamp);
    }

    function acceptOwnership() external {
        require(msg.sender == newOwner, "Only the new owner can accept the ownership.");
        owner = newOwner;
        newOwner = address(0);
        emit LogAcceptOwnership(msg.sender, block.timestamp);
    }

    event LogTransferOwnership(address indexed oldOwner, uint256 timestamp);
    event LogAcceptOwnership(address indexed newOwner, uint256 timestamp);

    modifier isOwner() {
        require(owner == msg.sender, "Only the owner can call a method");
        _;
    }
}

library SigUtil {

    function getMessageHash(address _to, uint _amount, bytes memory _message,
        uint _nonce) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_to, _amount, _message, _nonce));
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

    // todo remove nonce, remove amount
    function verify(address _signer, address _to, uint _amount, bytes memory _message,
        uint _nonce, bytes memory signature) internal pure returns (bool) {
        bytes32 messageHash = getMessageHash(_to, _amount, _message, _nonce);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);
        return recoverSigner(ethSignedMessageHash, signature) == _signer;
    }
}


contract ValidatorV1 is Ownable {

    uint256 public VNODE_COLLATERAL_IN_PUSH = 100; // todo check the amount

    // X REPORTS -> SLASH , PUNISH $SLASH_COLL_PERCENTAGE
    // X SLASHES -> BAN, PUNISH $BAN_COLL_PERCENTAGE
    uint32 public REPORT_COUNT_TO_SLASH = 2;
    uint32 public SLASH_COLL_PERCENTAGE = 1;

    uint32 public SLASH_COUNT_TO_BAN = 2;
    uint32 public BAN_COLL_PERCENTAGE = 10;

    uint32 public MIN_NODES_FOR_REPORT = 2; // todo update this on node join; should be 51%


    // token storages
    IPush pushToken;

    // node colleciton
    address[] nodes;
    mapping(address => NodeInfo) pubKeyToNodeMap;
    uint256 totalStaked;      // push tokens owned by this contract; which have an owner
    uint256 totalPenalties;   // push tokens owned by this contract; comes from penalties

    struct NodeInfo {
        address ownerWallet;
        address nodeWallet;       // eth wallet
        NodeType nodeType;
        uint256 pushTokensLocked;
        string nodeApiBaseUrl; // rest api url for invocation
        NodeCounters counters;
        NodeStatus status;
    }

    struct NodeCounters {
        uint16 reportCounter;
        uint16 slashCounter;
        uint16 banCounter;
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
        Banned       // we banned the node and unstaked it's tokens (normally we will take -10% of collateral tokens)
    }

    enum VoteAction {
        Report
        //        Slash,
        //        Ban
    }

    enum NodeType {
        VNode, // validator
        SNode, // storage
        DNode  // delivery
    }

    event NodeAdded(address indexed ownerWallet, address indexed nodeWallet, NodeType nodeType, uint256 pushTokensLocked, string nodeApiBaseUrl);
    event NodeStatusChanged(address indexed nodeWallet, NodeStatus nodeStatus, uint256 pushTokensLocked);

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

    constructor(address _pushToken) {
        require(_pushToken != address(0));
        owner = msg.sender;
        pushToken = IPush(_pushToken);
    }

    // Registers a new validator node
    // Locks PUSH tokens ($_token) with $_collateral amount.
    // A node will run from a _nodeWallet
    function registerNodeAndStake(uint256 _pushTokensLocked,
        NodeType _nodeType, string memory _nodeApiBaseUrl, address _nodeWallet) public {
        uint256 coll = _pushTokensLocked;
        if (_nodeType == NodeType.VNode) {
            require(coll >= VNODE_COLLATERAL_IN_PUSH, "Insufficient collateral for VNODE");
        } else {
            revert("unsupported nodeType ");
        }
        NodeInfo storage old = pubKeyToNodeMap[_nodeWallet];
        if (old.ownerWallet != address(0)) {
            revert("a node with pubKey is already defined");
        }
        // check that collateral is allowed to spend
        uint256 allowed = pushToken.allowance(msg.sender, address(this));
        require(allowed >= _pushTokensLocked, "_pushTokensLocked cannot be transferred, check allowance");
        // new mapping
        NodeInfo memory n;
        n.ownerWallet = msg.sender;
        n.nodeWallet = _nodeWallet;
        n.nodeType = _nodeType;
        n.pushTokensLocked = coll;
        n.nodeApiBaseUrl = _nodeApiBaseUrl;
        nodes.push(_nodeWallet);
        pubKeyToNodeMap[_nodeWallet] = n;
        // take collateral
        pushToken.transferFrom(msg.sender, address(this), coll);
        totalStaked += coll;
        // post actions
        MIN_NODES_FOR_REPORT = (uint32)(1 + (nodes.length / 2));
        emit NodeAdded(msg.sender, _nodeWallet, _nodeType, coll, _nodeApiBaseUrl);
    }



    // N attesters can request to report malicious activity for a specific node
    // lifecycle: report x 2 -> slash x 2 -> ban
    // if all prerequisites match - the contract will execute
    function reportNode(address[] memory _nodeIdsReported, bytes memory _signedMessageByAllNodes,
        bytes[] memory _signatures, address _target) external {
        for (uint i = 0; i < _signatures.length; i++) {
            bool valid = SigUtil.verify(_nodeIdsReported[i], address(0), 0, _signedMessageByAllNodes, 0, _signatures[i]);
            require(valid, "invalid signature");
        }
        require(_signatures.length >= MIN_NODES_FOR_REPORT, "not enough signatures for a message");
        VoteMessage memory vm = decodeVoteMessage(_signedMessageByAllNodes);
        doReportNode(_nodeIdsReported, vm);
    }

    // Complain on an existing node; also slashes if the # of complains meet the required threshold
    function doReportNode(address[] memory _nodeIdsReported, VoteMessage memory _vm) private {
        NodeInfo storage voterNode = pubKeyToNodeMap[msg.sender];
        if (voterNode.nodeWallet == address(0)) {
            revert("a node with _voterPubKey does not exists");
        }
        NodeInfo storage targetNode = pubKeyToNodeMap[_vm.target];
        if (targetNode.nodeWallet == address(0)) {
            revert("a node with _targetPubKey does not exists");
        }
        NodeCounters memory counters = targetNode.counters;
        NodeStatus ns = targetNode.status;
        // 2 check count
        if (_vm.vote == VoteAction.Report) {
            targetNode.counters.reportCounter = ++counters.reportCounter;
        } else {
            revert("unsupported");
        }
        if (ns == NodeStatus.OK) {
            if (counters.reportCounter > REPORT_COUNT_TO_SLASH) {
                // do Slash
                targetNode.status = NodeStatus.Slashed;
                targetNode.counters.reportCounter = 0;
                doSlash(targetNode);
            }
        } else if (ns == NodeStatus.Slashed) {
            if (counters.slashCounter > SLASH_COUNT_TO_BAN) {
                // do Ban
                targetNode.status = NodeStatus.Banned;
                targetNode.counters.slashCounter = 0;
                doBan(targetNode);
            }
        } else if (ns == NodeStatus.Banned) {
            // do nothing; terminal state
        }
    }

    /*
     Returns remaining collateral
    */
    function reduceCollateral(address _nodeWallet, uint32 _percentage) private returns (uint256) {
        require(_nodeWallet != address(0));
        require(_percentage >= 0 && _percentage <= 100, "percentage should be in [0, 100]");
        // reduce only pushTokensLocked; we do not transfer any tokens; it will affect only 'unstake'
        NodeInfo storage node = pubKeyToNodeMap[_nodeWallet];
        uint256 currentAmount = node.pushTokensLocked;
        uint256 newAmount = (currentAmount * (100 - _percentage)) / 100;
        uint256 delta = currentAmount - newAmount;
        node.pushTokensLocked = newAmount;
        totalStaked -= delta;
        totalPenalties += delta;
        return newAmount;
    }

    /*
    Returns unstaked amount
    */
    function unstake(address _nodeWallet) private returns (uint256){
        require(_nodeWallet != address(0));
        NodeInfo storage node = pubKeyToNodeMap[_nodeWallet];
        uint256 delta = node.pushTokensLocked;
        pushToken.transfer(node.ownerWallet, delta);
        node.pushTokensLocked = 0;
        totalStaked -= delta;
        return delta;
    }

    function getNodeInfo(address _nodeWallet) public view returns (NodeInfo memory) {
        return pubKeyToNodeMap[_nodeWallet];
    }

    function doSlash(NodeInfo storage targetNode) private {
        uint256 coll = reduceCollateral(targetNode.nodeWallet, SLASH_COLL_PERCENTAGE);
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.Slashed, coll);
    }

    function doBan(NodeInfo storage targetNode) private {
        reduceCollateral(targetNode.nodeWallet, BAN_COLL_PERCENTAGE);
        uint256 delta = unstake(targetNode.nodeWallet);
        emit NodeStatusChanged(targetNode.nodeWallet, NodeStatus.Banned, delta);
    }

}