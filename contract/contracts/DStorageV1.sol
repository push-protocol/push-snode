pragma solidity ^0.8.17;

// a mock interface of a PUSH token; only bare minimum is needed
interface IPush {
    function transferFrom(address src, address dst, uint rawAmount) external returns (bool);
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

    function getMessageHash(address _to, uint _amount, string memory _message,
        uint _nonce) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_to, _amount, _message, _nonce));
    }

    function getEthSignedMessageHash(bytes32 _messageHash) public pure returns (bytes32) {
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
        bytes memory _signature) public pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) public pure returns (bytes32 r, bytes32 s, uint8 v) {
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
    function verify(address _signer, address _to, uint _amount, string memory _message,
        uint _nonce, bytes memory signature) public pure returns (bool) {
        bytes32 messageHash = getMessageHash(_to, _amount, _message, _nonce);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);
        return recoverSigner(ethSignedMessageHash, signature) == _signer;
    }
}


contract DStorageV1 is Ownable {
    address private collateralWallet; // all PUSH tokens are staked here

    // node colleciton
    address[] nodes;
    mapping(address => NodeInfo) pubKeyToNodeMap;

    uint32 public MIN_NODES_FOR_REPORT = 2;
    uint32 public SLASH_PERCENTAGE = 1;
    uint32 public BAN_PERCENTAGE = 10;
    uint256 public VNODE_COLLATERAL = 100;


    struct NodeInfo {
        address ownerWallet;
        address nodeWallet;       // eth wallet
        NodeType nodeType;
        uint256 pushTokensLocked;
        string nodeApiBaseUrl; // rest api url for invocation
        Vote[] votes;
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
        address[] voter; // this is not the node which decided to vote, this is the one who reported
        // a message, signed by X other nodes
        address target;
        VoteAction voteAction;
    }

    enum NodeStatus {
        OK,          // this node operates just fine (DEFAULT VALUE)
        Reported,    // he have a few malicious reports
        Slashed,     // we already slashed this node at least once (normally we will take -2% of collateral tokens)
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
    event SNodesByNsAndShard(string ns, string shard, string[] value);
    event NodeSlashed(string indexed pubKey, VoteAction voteAction);
    event AmountStaked(address indexed walletId, uint256 amount);

    /* METHODS */


    struct VoteMessage {
        VoteAction vote;
        address target;
    }

    function decodeVoteMessage(bytes memory data) private pure returns (VoteMessage memory) {
        (VoteAction vote, address target) = abi.decode(data, (VoteAction, address));
        VoteMessage memory result;
        result.vote = vote;
        result.target = target;
        return result;
    }

    constructor() {
        owner = msg.sender;
        collateralWallet = msg.sender;
    }

    // Registers a new validator node
    // Locks PUSH tokens ($_token) with $_collateral amount.
    // A node will run from a _nodeWallet
    function registerNodeAndStake(address _token, uint256 _collateral,
        NodeType _nodeType, string memory _nodeApiBaseUrl, address _nodeWallet) public {
        uint256 coll = _collateral;
        if (_nodeType == NodeType.SNode) {
            require(coll >= SNODE_COLLATERAL, "Insufficient collateral for SNODE");
        } else if (_nodeType == NodeType.VNode) {
            require(coll >= VNODE_COLLATERAL, "Insufficient collateral for VNODE");
        } else {
            revert("unsupported nodeType ");
        }
        NodeInfo storage n = pubKeyToNodeMap[_nodeWallet];
        if (n.nodeWallet.length == 0) {
            // no mapping
            IPush token = IPush(_token);
            token.transferFrom(msg.sender, collateralWallet, coll);
            n.ownerWallet = msg.sender;
            n.nodeWallet = _nodeWallet;
            n.nodeType = _nodeType;
            n.pushTokensLocked = coll;
            n.nodeApiBaseUrl = _nodeApiBaseUrl;
            nodes.push(_nodeWallet);
            MIN_NODES_FOR_REPORT = 1 + (nodes.length / 2);
            emit NodeAdded(msg.sender, _nodeWallet, _nodeType, coll, _nodeApiBaseUrl);
        } else {
            revert("a node with pubKey is already defined");
        }
    }



    // N attesters can request to report malicious activity for a specific node
    // lifecycle: report x 2 -> slash x 2 -> ban
    // if all prerequisites match - the contract will execute
    function reportNode(address[] memory nodeIdsReported, bytes memory _signedMessageByAllNodes,
        string[] memory signatures, address _target) external {
        for (int i = 0; i < signatures.length; i++) {
            bool valid = SigUtil.verify(0, 0, 0, _signedMessageByAllNodes, 0, signatures[i]);
            require(valid, "invalid signature");
        }
        require(signatures.length >= MIN_NODES_FOR_REPORT, "not enough signatures for a message");
        VoteMessage memory vm = decodeVoteMessage(_signedMessageByAllNodes);
        doReportNode(vm);
    }

    // Complain on an existing node; also slashes if the # of complains meet the required threshold
    function doReportNode(VoteMessage memory vm) private {
        // 1 store
        NodeInfo storage voterNode = pubKeyToNodeMap[msg.sender];
        if (voterNode.nodeWallet == address(0)) {
            revert("a node with _voterPubKey does not exists");
        }
        NodeInfo storage targetNode = pubKeyToNodeMap[vm.target];
        if (targetNode.nodeWallet == address(0)) {
            revert("a node with _targetPubKey does not exists");
        }
        Vote memory v;
        v.ts = block.timestamp;
        v.voter = msg.sender;
        v.target = vm.target;
        v.voteAction = vm.vote;
        targetNode.votes.push(v);
        // 2 check count
        int slash = 0;
        int ban = 0;
        for (uint i = 0; i < targetNode.votes.length; i++) {
            Vote memory vt = targetNode.votes[i];
            if (vt.voteAction == VoteAction.Report) {
                slash++;
            }
            if (vt.voteAction == VoteAction.Ban) {
                ban++;
            }
        }
        NodeStatus memory slashResult = NodeStatus.OK;
        if (targetNode.status == NodeStatus.OK) {
            if (ban > 0 || slash > 3) {
                slashResult = NodeStatus.Ban;
            } else if (slash > 0) {
                slashResult = NodeStatus.Slash;
            }
        } else if (targetNode.status == NodeStatus.Slash) {
            if (ban > 0 || slash > 3) {
                slashResult = NodeStatus.Ban;
            }
        } else if (targetNode.status == NodeStatus.Ban) {
            // do nothing; terminal state
        }
        if (slashResult != NodeStatus.OK) {
            // TODO
        }
    }

}