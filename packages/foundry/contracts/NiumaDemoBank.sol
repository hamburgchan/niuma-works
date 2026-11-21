// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Testnet-only demonstration funding ledger. Does not alter NiumaWorksV2.
contract NiumaDemoBank is Ownable, ReentrancyGuard {
    uint256 public constant GRANT = 0.02 ether;
    uint256 public constant CAP = 1.5 ether;
    uint256 public distributed;
    mapping(address => bool) public claimed;
    uint64[] private claims;
    uint64 public lastBatchAt;
    bytes32 public latestBatch;
    struct Batch { uint64 startedAt; uint16 count; bytes plan; bytes result; }
    mapping(bytes32 => Batch) private batches;
    event Granted(address indexed recipient, uint256 amount);
    event BatchStarted(bytes32 indexed id, address payable[] wallets);
    event BatchFinished(bytes32 indexed id, bytes result);
    constructor(address signer) Ownable(signer) {}

    function remainingThisHour() public view returns (uint256) {
        uint256 used;
        for (uint256 i = claims.length; i > 0; --i) {
            if (uint256(claims[i - 1]) + 1 hours <= block.timestamp) break;
            ++used;
        }
        return used >= 60 ? 0 : 60 - used;
    }
    function grant(address payable recipient) external payable onlyOwner nonReentrant {
        require(msg.value == GRANT && recipient != address(0), "amount/address");
        require(!claimed[recipient], "already claimed");
        require(distributed + GRANT <= CAP, "total cap");
        require(remainingThisHour() > 0, "hour cap");
        claimed[recipient] = true;
        distributed += GRANT;
        claims.push(uint64(block.timestamp));
        (bool ok,) = recipient.call{value: GRANT}("");
        require(ok, "transfer failed");
        emit Granted(recipient, GRANT);
    }
    function startBatch(bytes32 id, address payable[] calldata wallets, bytes calldata plan) external payable onlyOwner nonReentrant {
        require(wallets.length > 0 && wallets.length <= 100, "count");
        require(batches[id].startedAt == 0 && id != bytes32(0), "batch exists");
        require(lastBatchAt == 0 || block.timestamp >= uint256(lastBatchAt) + 10 minutes, "cooldown");
        require(latestBatch == bytes32(0) || batches[latestBatch].result.length > 0, "unresolved batch");
        require(msg.value == wallets.length * 0.013 ether, "funding");
        lastBatchAt = uint64(block.timestamp);
        latestBatch = id;
        batches[id] = Batch(uint64(block.timestamp), uint16(wallets.length), plan, "");
        for (uint256 i; i < wallets.length; ++i) {
            require(wallets[i] != address(0), "zero wallet");
            (bool ok,) = wallets[i].call{value: 0.013 ether}("");
            require(ok, "funding failed");
        }
        emit BatchStarted(id, wallets);
    }
    function finishBatch(bytes32 id, bytes calldata result) external onlyOwner {
        require(batches[id].startedAt > 0 && batches[id].result.length == 0 && result.length > 0, "batch state");
        batches[id].result = result;
        emit BatchFinished(id, result);
    }
    function batch(bytes32 id) external view returns (Batch memory) { return batches[id]; }
}
