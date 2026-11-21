// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {NiumaDemoBank} from "../contracts/NiumaDemoBank.sol";
contract NiumaDemoBankTest is Test {
    NiumaDemoBank bank;
    function setUp() public { bank = new NiumaDemoBank(address(this)); vm.deal(address(this), 100 ether); vm.warp(10000); }
    function testGrantOnceAndExactAmount() public {
        address payable user = payable(makeAddr("user"));
        bank.grant{value: .02 ether}(user); assertEq(user.balance, .02 ether); assertEq(bank.distributed(), .02 ether);
        vm.expectRevert("already claimed"); bank.grant{value: .02 ether}(user);
    }
    function testSlidingHourAndTotalCap() public {
        for (uint160 i = 1; i <= 60; ++i) bank.grant{value: .02 ether}(payable(address(i + 1000)));
        vm.expectRevert("hour cap"); bank.grant{value: .02 ether}(payable(address(9999)));
        vm.warp(block.timestamp + 1 hours);
        for (uint160 i = 61; i <= 75; ++i) bank.grant{value: .02 ether}(payable(address(i + 1000)));
        assertEq(bank.distributed(), 1.5 ether);
        vm.expectRevert("total cap"); bank.grant{value: .02 ether}(payable(address(9999)));
    }
    function testBatchFundingCooldownAndUnresolvedGuard() public {
        address payable[] memory wallets = new address payable[](2); wallets[0] = payable(makeAddr("a")); wallets[1] = payable(makeAddr("b"));
        bank.startBatch{value: .026 ether}(bytes32(uint256(1)), wallets, "plan");
        assertEq(wallets[0].balance, .013 ether); assertEq(wallets[1].balance, .013 ether);
        vm.expectRevert("cooldown"); bank.startBatch{value: .026 ether}(bytes32(uint256(2)), wallets, "plan");
        vm.warp(block.timestamp + 600);
        vm.expectRevert("unresolved batch"); bank.startBatch{value: .026 ether}(bytes32(uint256(2)), wallets, "plan");
        bank.finishBatch(bytes32(uint256(1)), "done");
        bank.startBatch{value: .026 ether}(bytes32(uint256(2)), wallets, "plan");
    }
    function testNonOwnerCannotSpend() public { vm.prank(makeAddr("attacker")); vm.expectRevert(); bank.grant{value: 0}(payable(address(1234))); }
    function testCountCap() public { address payable[] memory wallets = new address payable[](101); vm.expectRevert("count"); bank.startBatch(bytes32(uint256(1)), wallets, "plan"); }
    function testRecipientFailureRollsBackClaim() public { vm.expectRevert("transfer failed"); bank.grant{value: .02 ether}(payable(address(this))); assertEq(bank.distributed(), 0); assertFalse(bank.claimed(address(this))); }
}
