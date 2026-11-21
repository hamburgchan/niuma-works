// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { NiumaWorksV2 } from "../contracts/NiumaWorksV2.sol";

contract NiumaWorksV2Test is Test {
    NiumaWorksV2 internal desk;
    address internal buyer = makeAddr("buyer");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");
    address internal donkey = makeAddr("donkey");
    address internal horse = makeAddr("horse");
    address internal cow = makeAddr("cow");
    bytes32 internal constant HASH = keccak256("a character");

    function setUp() public {
        desk = new NiumaWorksV2(address(this), operator, treasury, [donkey, horse, cow]);
        vm.deal(buyer, 100 ether);
        vm.deal(address(this), 100 ether);
    }

    function funded() internal returns (uint256 id) {
        uint256 price = desk.characterPrice();
        vm.prank(buyer);
        id = desk.order{ value: price }(HASH, uint64(block.timestamp + 100));
    }

    function delivered() internal returns (uint256 id, uint256 characterId) {
        id = funded();
        vm.prank(operator);
        characterId = desk.deliver(id, HASH, "https://example.com/character.glb");
    }

    function paid() internal returns (uint256 characterId) {
        (uint256 id, uint256 c) = delivered();
        vm.prank(buyer);
        desk.approve(id);
        return c;
    }

    function testCompleteOrderAndExactSplit() public {
        (uint256 id, uint256 c) = delivered();
        (address characterOwner, bytes32 hash, string memory uri, uint256 orderId,,,) = desk.characters(c);
        assertEq(characterOwner, buyer);
        assertEq(hash, HASH);
        assertEq(uri, "https://example.com/character.glb");
        assertEq(orderId, id);
        assertEq(desk.balances(donkey), 0);
        vm.prank(buyer);
        desk.approve(id);
        assertEq(desk.balances(donkey), 0.005 ether);
        assertEq(desk.balances(horse), 0.002 ether);
        assertEq(desk.balances(cow), 0.002 ether);
        assertEq(desk.balances(treasury), 0.001 ether);
        (,,, NiumaWorksV2.Status status,) = desk.orders(id);
        assertEq(uint256(status), uint256(NiumaWorksV2.Status.Paid));
    }

    function testFuzzSplitConservesWeiAndRemainder(uint96 amount) public {
        vm.deal(buyer, uint256(amount) + 1 ether);
        desk.setEconomics(amount, 1, [uint16(5000), 2000, 2000, 1000], 9000);
        uint256 c = paid();
        assertEq(c, 1);
        uint256 a = uint256(amount);
        assertEq(desk.balances(donkey), a * 5000 / 10000);
        assertEq(desk.balances(horse), a * 2000 / 10000);
        assertEq(desk.balances(cow), a * 2000 / 10000);
        assertEq(desk.balances(treasury), a - a * 5000 / 10000 - 2 * (a * 2000 / 10000));
        assertEq(address(desk).balance, a);
    }

    function testFundedTermsCannotChange() public {
        uint256 id = funded();
        desk.setEconomics(1, 2, [uint16(0), 0, 0, 10000], 0);
        desk.setRecipients(operator, makeAddr("new treasury"), [cow, horse, donkey]);
        vm.prank(operator);
        desk.deliver(id, HASH, "ipfs://character");
        vm.prank(buyer);
        desk.approve(id);
        assertEq(desk.balances(donkey), 0.005 ether);
        assertEq(desk.balances(treasury), 0.001 ether);
    }

    function testOrderAmountAndDeadline() public {
        vm.expectRevert(abi.encodeWithSelector(NiumaWorksV2.InvalidAmount.selector, 0.01 ether, 1));
        desk.order{ value: 1 }(HASH, uint64(block.timestamp + 1));
        vm.expectRevert(NiumaWorksV2.InvalidDeadline.selector);
        desk.order{ value: 0.01 ether }(HASH, uint64(block.timestamp));
    }

    function testOnlyOperatorCanDeliverOrCancel() public {
        uint256 id = funded();
        vm.expectRevert(NiumaWorksV2.OnlyOperator.selector);
        desk.deliver(id, HASH, "uri");
        vm.expectRevert(NiumaWorksV2.OnlyOperator.selector);
        desk.cancel(id);
    }

    function testOnlyBuyerCanApprove() public {
        (uint256 id,) = delivered();
        vm.expectRevert(NiumaWorksV2.OnlyBuyer.selector);
        desk.approve(id);
    }

    function testCannotSettleTwiceOrDeliverTwice() public {
        (uint256 id,) = delivered();
        vm.prank(operator);
        vm.expectRevert(NiumaWorksV2.WrongStatus.selector);
        desk.deliver(id, HASH, "uri");
        vm.prank(buyer);
        desk.approve(id);
        vm.prank(buyer);
        vm.expectRevert(NiumaWorksV2.WrongStatus.selector);
        desk.approve(id);
    }

    function testCancelReturnsEntireOriginalPriceAsWithdrawableBalance() public {
        uint256 id = funded();
        desk.setEconomics(1, 1, [uint16(5000), 2000, 2000, 1000], 9000);
        vm.prank(operator);
        desk.cancel(id);
        assertEq(desk.balances(buyer), 0.01 ether);
        vm.prank(operator);
        vm.expectRevert(NiumaWorksV2.WrongStatus.selector);
        desk.cancel(id);
        vm.prank(buyer);
        desk.withdraw();
        assertEq(buyer.balance, 100 ether);
    }

    function testRefundAtDeadlineRejectedThenAllowedAfter() public {
        uint256 id = funded();
        vm.warp(block.timestamp + 100);
        vm.prank(buyer);
        vm.expectRevert(NiumaWorksV2.NotExpired.selector);
        desk.refund(id);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(NiumaWorksV2.OnlyBuyer.selector);
        desk.refund(id);
        vm.prank(buyer);
        desk.refund(id);
        assertEq(desk.balances(buyer), 0.01 ether);
    }

    function testDeliveryAllowedAtDeadlineNotAfter() public {
        uint256 first = funded();
        uint256 second = funded();
        vm.warp(block.timestamp + 100);
        vm.prank(operator);
        desk.deliver(first, HASH, "uri");
        vm.warp(block.timestamp + 1);
        vm.prank(operator);
        vm.expectRevert(NiumaWorksV2.Expired.selector);
        desk.deliver(second, HASH, "uri");
    }

    function testRefundCannotTakeDeliveredFunds() public {
        (uint256 id,) = delivered();
        vm.warp(block.timestamp + 101);
        vm.prank(buyer);
        vm.expectRevert(NiumaWorksV2.WrongStatus.selector);
        desk.refund(id);
    }

    function testRunPaymentsAndBestScore() public {
        uint256 c = paid();
        desk.finishRun{ value: 0.001 ether }(c, 3, 20_000);
        desk.finishRun{ value: 0.001 ether }(c, 6, 50_000);
        desk.finishRun{ value: 0.001 ether }(c, 6, 30_000);
        desk.finishRun{ value: 0.001 ether }(c, 5, 1);
        (,,,, uint8 stars, uint64 timeMs, uint64 runs) = desk.characters(c);
        assertEq(stars, 6);
        assertEq(timeMs, 30_000);
        assertEq(runs, 4);
        assertEq(desk.characterWages(c), 0.0036 ether);
        assertEq(desk.balances(treasury), 0.001 ether);
        desk.sweepTreasury();
        assertEq(desk.balances(treasury), 0.0014 ether);
    }

    function testRunRejectsWrongFeeStarsAndUnpaidCharacter() public {
        (uint256 id, uint256 c) = delivered();
        vm.expectRevert(NiumaWorksV2.WrongStatus.selector);
        desk.finishRun{ value: 0.001 ether }(c, 6, 1);
        vm.prank(buyer);
        desk.approve(id);
        vm.expectRevert(abi.encodeWithSelector(NiumaWorksV2.InvalidAmount.selector, 0.001 ether, 1));
        desk.finishRun{ value: 1 }(c, 6, 1);
        vm.expectRevert(NiumaWorksV2.InvalidStars.selector);
        desk.finishRun{ value: 0.001 ether }(c, 7, 1);
        vm.expectRevert(NiumaWorksV2.UnknownCharacter.selector);
        desk.finishRun{ value: 0.001 ether }(0, 0, 0);
    }

    function testZeroStarFirstRunAndEqualScoreTie() public {
        uint256 c = paid();
        desk.finishRun{ value: 0.001 ether }(c, 0, 20_000);
        desk.finishRun{ value: 0.001 ether }(c, 0, 10_000);
        desk.finishRun{ value: 0.001 ether }(c, 0, 30_000);
        (,,,, uint8 stars, uint64 timeMs, uint64 runs) = desk.characters(c);
        assertEq(stars, 0);
        assertEq(timeMs, 10_000);
        assertEq(runs, 3);
    }

    function testWithdrawAndDoubleWithdraw() public {
        paid();
        vm.prank(donkey);
        desk.withdraw();
        assertEq(donkey.balance, 0.005 ether);
        assertEq(desk.balances(donkey), 0);
        vm.prank(donkey);
        vm.expectRevert(NiumaWorksV2.NothingToWithdraw.selector);
        desk.withdraw();
    }

    function testInvalidEconomicsAndRecipients() public {
        vm.expectRevert(NiumaWorksV2.InvalidBps.selector);
        desk.setEconomics(1, 1, [uint16(1), 2, 3, 4], 9000);
        vm.expectRevert(NiumaWorksV2.InvalidBps.selector);
        desk.setEconomics(1, 1, [uint16(5000), 2000, 2000, 1000], 10001);
        vm.expectRevert(NiumaWorksV2.ZeroAddress.selector);
        desk.setRecipients(address(0), treasury, [donkey, horse, cow]);
    }

    function testSweepExactAndIdempotentAcrossEconomicsAndRecipients() public {
        uint256 c = paid();
        desk.finishRun{value:0.001 ether}(c, 6, 15000);
        desk.sweepTreasury();
        desk.sweepTreasury();
        assertEq(desk.balances(treasury), 0.0011 ether);
        desk.finishRun{value:0.001 ether}(c, 6, 15000);
        desk.setEconomics(0.01 ether, 101, [uint16(5000),2000,2000,1000], 3333);
        assertEq(desk.balances(treasury), 0.0012 ether);
        desk.finishRun{value:101}(c, 6, 15000);
        address next = makeAddr("next");
        desk.setRecipients(operator,next,[donkey,horse,cow]);
        assertEq(desk.balances(treasury), 0.0012 ether + 68);
        desk.finishRun{value:101}(c, 6, 15000);
        desk.sweepTreasury();
        assertEq(desk.balances(next),68);
    }
    function testCharacterWagesWithdrawExactlyOnceAndAggregate() public {
        uint256 c = paid();
        desk.finishRun{value:0.001 ether}(c,6,15000);
        uint256 beforeBalance=buyer.balance;
        vm.prank(buyer); desk.withdrawCharacter(c);
        assertEq(buyer.balance-beforeBalance,0.0009 ether);
        vm.prank(buyer); vm.expectRevert(NiumaWorksV2.NothingToWithdraw.selector); desk.withdrawCharacter(c);
        uint256 second=paid();
        desk.finishRun{value:0.001 ether}(c,3,20000);
        desk.finishRun{value:0.001 ether}(second,4,21000);
        assertEq(desk.claimable(buyer),0.0018 ether);
        beforeBalance=buyer.balance;
        vm.prank(buyer); desk.withdraw();
        assertEq(buyer.balance-beforeBalance,0.0018 ether);
        assertEq(desk.claimable(buyer),0);
        desk.sweepTreasury();
        assertEq(desk.balances(treasury),0.0023 ether);
    }
}
