// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Testnet character commissions and client-reported game results.
contract NiumaWorksV2 is Ownable, ReentrancyGuard {
    enum Status {
        Funded,
        Delivered,
        Paid,
        Refunded
    }

    struct Order {
        address buyer;
        bytes32 promptHash;
        uint64 deadline;
        Status status;
        uint256 characterId;
    }

    struct Character {
        address owner;
        bytes32 sha256;
        string uri;
        uint256 orderId;
        uint8 bestStars;
        uint64 bestTimeMs;
        uint64 runs;
    }

    // Commission terms are fixed when funded, including recipients and price.
    struct Terms {
        uint256 amount;
        address[4] recipients;
        uint16[4] bps;
    }

    uint256 public constant BPS = 10_000;
    uint256 public characterPrice = 0.01 ether;
    uint256 public playFee = 0.001 ether;
    uint16 public characterOwnerBps = 9_000;
    uint16[4] public workstationBps = [uint16(5_000), 2_000, 2_000, 1_000];
    address public operator;
    address public treasury;
    address[3] public payouts;
    uint256 public orderCount;
    uint256 public characterCount;
    mapping(uint256 => Order) public orders;
    mapping(uint256 => Character) public characters;
    mapping(uint256 => Terms) private terms;
    mapping(address => uint256) public balances;
    mapping(uint256 => uint256) public characterWages;
    mapping(uint256 => uint64) public treasurySweptRuns;
    event TreasurySwept(address indexed recipient, uint256 amount);
    event CharacterWagesWithdrawn(uint256 indexed characterId, address indexed recipient, uint256 amount);

    error ZeroAddress();
    error InvalidAmount(uint256 expected, uint256 actual);
    error InvalidDeadline();
    error UnknownOrder();
    error WrongStatus();
    error OnlyOperator();
    error OnlyBuyer();
    error Expired();
    error NotExpired();
    error InvalidDelivery();
    error UnknownCharacter();
    error InvalidStars();
    error InvalidBps();
    error NothingToWithdraw();
    error TransferFailed();

    event Ordered(uint256 indexed orderId, address indexed buyer, bytes32 promptHash, uint64 deadline, uint256 amount);
    event Delivered(uint256 indexed orderId, uint256 indexed characterId, bytes32 sha256, string uri);
    event Paid(uint256 indexed orderId, address[4] recipients, uint256[4] amounts);
    event Refunded(uint256 indexed orderId, address indexed buyer, uint256 amount);
    event RunFinished(
        uint256 indexed characterId, address indexed player, uint8 stars, uint64 timeMs, uint256 ownerShare
    );
    event Withdrawn(address indexed recipient, uint256 amount);
    event ConfigurationChanged();

    constructor(
        address initialOwner,
        address initialOperator,
        address initialTreasury,
        address[3] memory initialPayouts
    ) Ownable(initialOwner) {
        _setRecipients(initialOperator, initialTreasury, initialPayouts);
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    function setRecipients(address nextOperator, address nextTreasury, address[3] calldata nextPayouts)
        external
        onlyOwner
    {
        sweepTreasury();
        _setRecipients(nextOperator, nextTreasury, nextPayouts);
        emit ConfigurationChanged();
    }

    function _setRecipients(address nextOperator, address nextTreasury, address[3] memory nextPayouts) private {
        if (nextOperator == address(0) || nextTreasury == address(0)) revert ZeroAddress();
        for (uint256 i; i < 3; ++i) {
            if (nextPayouts[i] == address(0)) revert ZeroAddress();
        }
        operator = nextOperator;
        treasury = nextTreasury;
        payouts = nextPayouts;
    }

    function setEconomics(uint256 nextPrice, uint256 nextPlayFee, uint16[4] calldata nextBps, uint16 nextOwnerBps)
        external
        onlyOwner
    {
        sweepTreasury();
        uint256 sum;
        for (uint256 i; i < 4; ++i) {
            sum += nextBps[i];
        }
        if (sum != BPS || nextOwnerBps > BPS) revert InvalidBps();
        characterPrice = nextPrice;
        playFee = nextPlayFee;
        workstationBps = nextBps;
        characterOwnerBps = nextOwnerBps;
        emit ConfigurationChanged();
    }

    function order(bytes32 promptHash, uint64 deadline) external payable returns (uint256 orderId) {
        if (msg.value != characterPrice) revert InvalidAmount(characterPrice, msg.value);
        if (deadline <= block.timestamp) revert InvalidDeadline();
        orderId = ++orderCount;
        orders[orderId] = Order(msg.sender, promptHash, deadline, Status.Funded, 0);
        Terms storage t = terms[orderId];
        t.amount = msg.value;
        t.recipients = [payouts[0], payouts[1], payouts[2], treasury];
        t.bps = workstationBps;
        emit Ordered(orderId, msg.sender, promptHash, deadline, msg.value);
    }

    function deliver(uint256 orderId, bytes32 contentSha256, string calldata uri)
        external
        onlyOperator
        returns (uint256 characterId)
    {
        Order storage o = _order(orderId);
        if (o.status != Status.Funded) revert WrongStatus();
        if (block.timestamp > o.deadline) revert Expired();
        if (contentSha256 == bytes32(0) || bytes(uri).length == 0) revert InvalidDelivery();
        characterId = ++characterCount;
        characters[characterId] = Character(o.buyer, contentSha256, uri, orderId, 0, 0, 0);
        o.characterId = characterId;
        o.status = Status.Delivered;
        emit Delivered(orderId, characterId, contentSha256, uri);
    }

    function approve(uint256 orderId) external {
        Order storage o = _order(orderId);
        if (msg.sender != o.buyer) revert OnlyBuyer();
        if (o.status != Status.Delivered) revert WrongStatus();
        o.status = Status.Paid;
        Terms storage t = terms[orderId];
        uint256[4] memory amounts;
        uint256 allocated;
        for (uint256 i; i < 3; ++i) {
            amounts[i] = t.amount * t.bps[i] / BPS;
            allocated += amounts[i];
            balances[t.recipients[i]] += amounts[i];
        }
        amounts[3] = t.amount - allocated;
        balances[t.recipients[3]] += amounts[3];
        emit Paid(orderId, t.recipients, amounts);
    }

    function cancel(uint256 orderId) external onlyOperator {
        _refund(orderId, false);
    }

    function refund(uint256 orderId) external {
        _refund(orderId, true);
    }

    function _refund(uint256 orderId, bool byBuyer) private {
        Order storage o = _order(orderId);
        if (o.status != Status.Funded) revert WrongStatus();
        if (byBuyer) {
            if (msg.sender != o.buyer) revert OnlyBuyer();
            if (block.timestamp <= o.deadline) revert NotExpired();
        }
        o.status = Status.Refunded;
        uint256 amount = terms[orderId].amount;
        balances[o.buyer] += amount;
        emit Refunded(orderId, o.buyer, amount);
    }

    /// @dev Scores are untrusted client input; this is not a cheat-resistant leaderboard.
    function finishRun(uint256 characterId, uint8 stars, uint64 timeMs) external payable {
        if (characterId == 0 || characterId > characterCount) revert UnknownCharacter();
        Character storage c = characters[characterId];
        if (orders[c.orderId].status != Status.Paid) revert WrongStatus();
        if (msg.value != playFee) revert InvalidAmount(playFee, msg.value);
        if (stars > 6) revert InvalidStars();
        uint256 ownerShare = msg.value * characterOwnerBps / BPS;
        characterWages[characterId] += ownerShare;
        if (c.runs == 0 || stars > c.bestStars || (stars == c.bestStars && timeMs < c.bestTimeMs)) {
            c.bestStars = stars;
            c.bestTimeMs = timeMs;
        }
        ++c.runs;
        emit RunFinished(characterId, msg.sender, stars, timeMs, ownerShare);
    }

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        for (uint256 id = 1; id <= characterCount; ++id) {
            if (characters[id].owner == msg.sender) {
                amount += characterWages[id];
                characterWages[id] = 0;
            }
        }
        if (amount == 0) revert NothingToWithdraw();
        balances[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{ value: amount }("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Platform credits are settled lazily; finishRun has no shared treasury write.
    /// @dev Configuration setters sweep under the old terms before applying new terms.
    function sweepTreasury() public {
        uint256 amount;
        uint256 perRun = playFee - playFee * characterOwnerBps / BPS;
        for (uint256 id = 1; id <= characterCount; ++id) {
            uint64 runs = characters[id].runs;
            amount += uint256(runs - treasurySweptRuns[id]) * perRun;
            treasurySweptRuns[id] = runs;
        }
        if (amount != 0) {
            balances[treasury] += amount;
            emit TreasurySwept(treasury, amount);
        }
    }

    function claimable(address recipient) external view returns (uint256 amount) {
        amount = balances[recipient];
        for (uint256 id = 1; id <= characterCount; ++id) {
            if (characters[id].owner == recipient) amount += characterWages[id];
        }
    }

    function withdrawCharacter(uint256 id) external nonReentrant {
        if (characters[id].owner != msg.sender) revert OnlyBuyer();
        uint256 amount = characterWages[id];
        if (amount == 0) revert NothingToWithdraw();
        characterWages[id] = 0;
        (bool ok,) = payable(msg.sender).call{ value: amount }("");
        if (!ok) revert TransferFailed();
        emit CharacterWagesWithdrawn(id, msg.sender, amount);
    }

    function getOrderTerms(uint256 orderId) external view returns (Terms memory) {
        _order(orderId);
        return terms[orderId];
    }

    function _order(uint256 orderId) private view returns (Order storage o) {
        if (orderId == 0 || orderId > orderCount) revert UnknownOrder();
        return orders[orderId];
    }
}
