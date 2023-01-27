//SPDX-LIcense-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DStorageV1 {
    // pubKey -> NodeInfo
    mapping(address => NodeInfo) pubKeyToNodeMap;
    // storage layout: 'feeds' -> '0x25' -> ['node1','node2','node3']
    mapping(string => mapping(string => string[])) nsToShardToSNodeMap; // todo not used yet
    // storage layout: 'feeds' -> ['0x25','0x26']
    mapping(string => string[]) nsToShard; // todo not used yet

    // subscription for API users
    mapping(address => Subscriber) subscribers;

    IERC20 public token;

    uint public constant TIME_1_DAY = 1 days;

    uint256 public SNODE_COLLATERAL = 60;
    uint256 public VNODE_COLLATERAL = 100;

    struct NodeInfo {
        bytes pubKey;         // custom public key (non-eth)
        address walletId;       // eth wallet // todo decide to store only pubKey or walletId
        NodeType nodeType;
        uint256 pushTokensLocked;
        string nodeApiBaseUrl; // rest api url for invocation
        Vote[] votes;
        SlashResult slashResult;         // 0 = OK
    }

    struct Vote {
        uint256 ts;
        address voter;
        address target;
        VoteAction voteAction;
    }

    enum SlashResult {
        OK,
        Slash,
        Ban
    }

    enum VoteAction {
        Slash,
        Ban
    }

    struct Subscriber {
        address walletId;
        uint256 stakedAmount;
        bool isStaked;
    }

    enum NodeType {
        VNode, // validator
        SNode, // storage
        DNode  // delivery
    }

    event NodeAdded(string indexed pubKey, string walletId, NodeType nodeType, uint256 pushTokensLocked, string nodeApiBaseUrl);
    event SNodesByNsAndShard(string ns, string shard, string[] value);
    event NodeSlashed(string indexed pubKey, VoteAction voteAction);
    event AmountStaked(address indexed walletId, uint256 amount);

    constructor(IERC20 _token) {
        token = _token;
    }

    function findSNodesByNsAndShard(string memory ns, string memory shard) public view returns (string[] memory d) {
        return nsToShardToSNodeMap[ns][shard];
    }

    function setSNodesByNsAndShard(string memory ns, string memory shard, string[] memory value) public returns (bool success) {
        nsToShardToSNodeMap[ns][shard] = value;
        emit SNodesByNsAndShard(ns, shard, value);
        return true;
    }

    function purchase(uint256 _amount) public returns(bool){
        require(_amount <= token.balanceOf(msg.sender), "Insufficient balance");
        require(subscribers[msg.sender].isStaked == true, "Already staked");
        token.transferFrom(msg.sender, address(this), _amount);
        subscribers[msg.sender].walletId = msg.sender;
        subscribers[msg.sender].stakedAmount = _amount;
        subscribers[msg.sender].isStaked = true;
        emit AmountStaked(msg.sender, _amount);
        return true;
    }

    function checkPubKeyMatchesSender(bytes memory pubkey) private view returns (bool){
        return (uint256(keccak256(pubkey)) & 0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) == uint256(uint160(msg.sender));
    }

    // Create a new node
    function registerNode(bytes memory _pubKey, NodeType _nodeType, string memory _nodeApiBaseUrl) public payable {
        require(subscribers[msg.sender].isStaked == false, "Not staked");
        uint256 coll = subscribers[msg.sender].stakedAmount;
        if (_nodeType == NodeType.SNode) {
            require(coll >= SNODE_COLLATERAL, "Insufficient collateral for SNODE");
        } else if (_nodeType == NodeType.VNode) {
            require(coll >= VNODE_COLLATERAL, "Insufficient collateral for VNODE");
        } else {
            revert("unsupported nodeType ");
        }
        if (!checkPubKeyMatchesSender(_pubKey)) {
            revert("pubKey does not match");
        }
        NodeInfo storage n = pubKeyToNodeMap[msg.sender];
        if (n.pubKey.length == 0) {
            // no mapping
            n.pubKey = _pubKey;
            n.walletId = msg.sender;
            n.nodeType = _nodeType;
            n.pushTokensLocked = coll;
            n.nodeApiBaseUrl = _nodeApiBaseUrl;
        } else {
            revert("a node with pubKey is already defined");
            // todo update?
        }
    }

    // Complain on an existing node; also slashes if the # of complains meet the required threshold
    function reportNode(address _target, VoteAction _voteAction) public payable {
        // 1 store
        address _voter = msg.sender;
        NodeInfo storage voterNode = pubKeyToNodeMap[_voter];
        if (voterNode.walletId == address(0)) {
            revert("a node with _voterPubKey does not exists");
        }
        NodeInfo storage targetNode = pubKeyToNodeMap[_target];
        if (targetNode.walletId == address(0)) {
            revert("a node with _targetPubKey does not exists");
        }
        Vote memory v;
        v.ts = block.timestamp;
        v.voter = _voter;
        v.target = _target;
        v.voteAction = _voteAction;
        targetNode.votes.push(v);
        // 2 check count
        int slash = 0;
        int ban = 0;
        for (uint i = 0; i < targetNode.votes.length; i++) {
            Vote memory vt = targetNode.votes[i];
            if (vt.voteAction == VoteAction.Slash) {
                slash++;
            }
            if (vt.voteAction == VoteAction.Ban) {
                ban++;
            }
        }
        if (targetNode.slashResult == SlashResult.OK) {
            if (ban > 0 || slash > 3) {
                targetNode.slashResult = SlashResult.Ban;
            } else if (slash > 0) {
                targetNode.slashResult = SlashResult.Slash;
            }
        } else if (targetNode.slashResult == SlashResult.Slash) {
            if (ban > 0 || slash > 3) {
                targetNode.slashResult = SlashResult.Ban;
            }
        } else if (targetNode.slashResult == SlashResult.Ban) {
            // do nothing; terminal state
        }
    }

}