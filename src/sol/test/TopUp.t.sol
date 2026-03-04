// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {TopUp} from "../TopUp.sol";
import {ITopUp} from "../interfaces/ITopUp.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("AZT Token", "AZT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TopUpBase is Test {
    TopUp public topUp;
    MockERC20 public azt;

    address public feeRecipient = makeAddr("feeRecipient");
    address public user = makeAddr("user");
    address public stranger = makeAddr("stranger");

    uint256 internal constant _MINT_AMOUNT = 1000 ether;

    function setUp() public virtual {
        azt = new MockERC20();
        topUp = new TopUp(address(azt), feeRecipient);

        azt.mint(user, _MINT_AMOUNT);

        vm.prank(user);
        azt.approve(address(topUp), type(uint256).max);
    }
}

contract TopUp_Constructor is TopUpBase {
    function test_setsInitialState() public view {
        assertEq(topUp.AZT_TOKEN(), address(azt));
        assertEq(topUp.feeRecipient(), feeRecipient);
        assertEq(topUp.pendingFeeRecipient(), address(0));
    }
}

contract TopUp_topUp is TopUpBase {
    function test_transfersTokensAndEmitsEvent(uint256 _amount) public {
        _amount = bound(_amount, 1, _MINT_AMOUNT);
        address _from = user;

        vm.expectEmit(true, false, false, true, address(topUp));
        emit ITopUp.TopUp(_from, _amount);

        vm.prank(user);
        topUp.topUp(_from, _amount);

        assertEq(azt.balanceOf(feeRecipient), _amount);
        assertEq(azt.balanceOf(user), _MINT_AMOUNT - _amount);
    }

    function test_revertsWithoutApproval(uint256 _amount) public {
        _amount = bound(_amount, 1, _MINT_AMOUNT);
        azt.mint(stranger, _amount);

        vm.prank(stranger);
        vm.expectRevert();
        topUp.topUp(stranger, _amount);
    }

    function test_revertsOnInsufficientBalance(uint256 _amount) public {
        _amount = bound(_amount, _MINT_AMOUNT + 1, type(uint128).max);

        vm.prank(user);
        vm.expectRevert();
        topUp.topUp(user, _amount);
    }

    function test_multipleCallsSameFrom(uint256 _amount1, uint256 _amount2) public {
        _amount1 = bound(_amount1, 1, _MINT_AMOUNT / 2);
        _amount2 = bound(_amount2, 1, _MINT_AMOUNT / 2);

        vm.startPrank(user);

        vm.expectEmit(true, false, false, true, address(topUp));
        emit ITopUp.TopUp(user, _amount1);
        topUp.topUp(user, _amount1);

        vm.expectEmit(true, false, false, true, address(topUp));
        emit ITopUp.TopUp(user, _amount2);
        topUp.topUp(user, _amount2);

        vm.stopPrank();

        assertEq(azt.balanceOf(feeRecipient), _amount1 + _amount2);
    }

    function test_differentFromThanCaller(uint256 _amount) public {
        _amount = bound(_amount, 1, _MINT_AMOUNT);
        address _logicalPayer = makeAddr("logicalPayer");

        vm.expectEmit(true, false, false, true, address(topUp));
        emit ITopUp.TopUp(_logicalPayer, _amount);

        vm.prank(user);
        topUp.topUp(_logicalPayer, _amount);

        assertEq(azt.balanceOf(feeRecipient), _amount);
        assertEq(azt.balanceOf(user), _MINT_AMOUNT - _amount);
        assertEq(azt.balanceOf(_logicalPayer), 0);
    }
}

contract TopUp_proposeFeeRecipient is TopUpBase {
    function test_onlyFeeRecipient(address _nominee) public {
        vm.prank(stranger);
        vm.expectRevert(ITopUp.TopUp_OnlyFeeRecipient.selector);
        topUp.proposeFeeRecipient(_nominee);
    }

    function test_setsCorrectly(address _nominee) public {
        vm.expectEmit(true, true, false, false, address(topUp));
        emit ITopUp.FeeRecipientTransferStarted(feeRecipient, _nominee);

        vm.prank(feeRecipient);
        topUp.proposeFeeRecipient(_nominee);

        assertEq(topUp.pendingFeeRecipient(), _nominee);
        assertEq(topUp.feeRecipient(), feeRecipient);
    }

    function test_overridesPrevious(address _first, address _second) public {
        vm.startPrank(feeRecipient);

        topUp.proposeFeeRecipient(_first);
        assertEq(topUp.pendingFeeRecipient(), _first);

        topUp.proposeFeeRecipient(_second);
        assertEq(topUp.pendingFeeRecipient(), _second);

        vm.stopPrank();
    }
}

contract TopUp_acceptFeeRecipient is TopUpBase {
    address public newRecipient = makeAddr("newRecipient");

    function setUp() public override {
        super.setUp();

        vm.prank(feeRecipient);
        topUp.proposeFeeRecipient(newRecipient);
    }

    function test_onlyPending() public {
        vm.prank(stranger);
        vm.expectRevert(ITopUp.TopUp_OnlyPendingFeeRecipient.selector);
        topUp.acceptFeeRecipient();
    }

    function test_transfersRole() public {
        vm.expectEmit(true, true, false, false, address(topUp));
        emit ITopUp.FeeRecipientTransferred(feeRecipient, newRecipient);

        vm.prank(newRecipient);
        topUp.acceptFeeRecipient();

        assertEq(topUp.feeRecipient(), newRecipient);
        assertEq(topUp.pendingFeeRecipient(), address(0));
    }

    function test_topUpUsesNewRecipient(uint256 _amount) public {
        _amount = bound(_amount, 1, _MINT_AMOUNT);

        vm.prank(newRecipient);
        topUp.acceptFeeRecipient();

        vm.prank(user);
        topUp.topUp(user, _amount);

        assertEq(azt.balanceOf(newRecipient), _amount);
        assertEq(azt.balanceOf(feeRecipient), 0);
    }
}
