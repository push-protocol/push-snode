pragma solidity >=0.7.0 <0.9.0;


contract DStorage {
    // pubKey -> NodeInfo
    mapping(address => NodeInfo) pubKeyToNodeMap;
    // storage layout: 'feeds' -> '0x25' -> ['node1','node2','node3']
    mapping(string => mapping(string => string[])) nsToShardToSNodeMap; // todo not used yet
    // storage layout: 'feeds' -> ['0x25','0x26']
    mapping(string => string[]) nsToShard; // todo not used yet

    // subscription for API users
    mapping(address => Subscriber) subscribers;

    uint public constant TIME_1_DAY = 1 days;

    uint256 public constant MONTHLY_PERIOD = 30 days;
    uint256 public MONTHLY_FEE = 0.01 ether;
    uint256 DAILY_FEE = MONTHLY_FEE / MONTHLY_PERIOD;
    uint256 public TRIAL_PERIOD = 15 days;

    uint256 public SNODE_COLLATERAL = 0.001 ether;
    uint256 public VNODE_COLLATERAL = 0.01 ether;


    enum SubscriptionType {
        Trial,
        Paid
    }

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
        SubscriptionType subsType;
        uint256 expires;
    }

    enum NodeType {
        VNode, // validator
        SNode, // storage
        DNode  // delivery
    }

    event NodeAdded(string indexed pubKey, string walletId, NodeType nodeType, uint256 pushTokensLocked, string nodeApiBaseUrl);
    event NodeSlashed(string indexed pubKey, VoteAction voteAction);
    event SubscriptionUpdated(address indexed walledId, SubscriptionType subsType, uint256 expires);

    function findSNodesByNsAndShard(string memory ns, string memory shard) public view returns (string[] memory d) {
        return nsToShardToSNodeMap[ns][shard];
    }

    function setSNodesByNsAndShard(string memory ns, string memory shard, string[] memory value) public returns (bool success) {
        nsToShardToSNodeMap[ns][shard] = value;
        return true;
    }

    // Purchase a subscription
    // for first time users: pay 0 wei to get 15 days access
    // for other users: pay for N amount of days; we charge 0.01 eth per month (15$ in Jan 2023)
    function purchaseSubscription() public payable {
        Subscriber memory sub = subscribers[msg.sender];
        bool isTrial = msg.value < DAILY_FEE;
        if (sub.walletId == address(0)) {
            // no mapping, trial is allowed for the first time
            sub.walletId = msg.sender;
            sub.subsType = SubscriptionType.Trial;
            sub.expires = block.timestamp + TRIAL_PERIOD;
        } else {
            // mapping exists
            require(msg.value >= DAILY_FEE, "Insufficient payment");
            sub.subsType = SubscriptionType.Paid;
            uint daysToAdd = (msg.value / DAILY_FEE) * (1 days);
            sub.expires = block.timestamp + daysToAdd;
        }
        emit SubscriptionUpdated(sub.walletId, sub.subsType, sub.expires);
    }

    function checkPubKeyMatchesSender(bytes memory pubkey) private view returns (bool){
        return (uint256(keccak256(pubkey)) & 0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) == uint256(uint160(msg.sender));
    }

    // Create a new node
    function registerNode(bytes memory _pubKey, NodeType _nodeType, string memory _nodeApiBaseUrl) public payable {
        uint256 coll = 0;
        if (_nodeType == NodeType.SNode) {
            coll = msg.value;
            require(msg.value >= SNODE_COLLATERAL, "Insufficient collateral for SNODE");
        } else if (_nodeType == NodeType.VNode) {
            coll = msg.value;
            require(msg.value >= VNODE_COLLATERAL, "Insufficient collateral for VNODE");
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
            n.pushTokensLocked = msg.value;
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