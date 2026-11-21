// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";
import {JobWallet} from "../src/JobWallet.sol";
import {RepaymentRouter} from "../src/RepaymentRouter.sol";
import {MockTUSD8} from "./mocks/MockTUSD8.sol";
import {HookToken} from "./mocks/HookToken.sol";

/// @notice The whole system deployed on a hostile token that re-enters during transfers.
contract ReentrancyTest is Base {
    function _newToken() internal override returns (MockTUSD8) {
        return MockTUSD8(address(new HookToken()));
    }

    function _hook() internal view returns (HookToken) {
        return HookToken(address(token));
    }

    /// Malicious payee: when it receives a payment it tries to pull a second one in the same call.
    function test_maliciousPayee_cannotReenterPay() public {
        (, JobWallet jw) = _funded();
        _grant(jw);
        _hook().arm(address(jw), abi.encodeCall(JobWallet.pay, (annotatorA, 1, bytes32(0))));
        vm.prank(payout);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        jw.pay(annotatorA, C.PAY_A, "");
        assertEq(token.balanceOf(annotatorA), 0, "nothing paid");
        assertEq(jw.sessionOf(payout).spent, 0, "no spend recorded");
    }

    /// Malicious token re-entering the router mid-repayment (would double-settle without the guard).
    function test_maliciousToken_cannotReenterRouter() public {
        (bytes32 id,) = _funded();
        vm.prank(buyer);
        token.approve(address(a.router), type(uint256).max);
        _hook().arm(address(a.router), abi.encodeCall(RepaymentRouter.pay, (id)));
        vm.prank(buyer);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        a.router.pay(id);
        assertEq(a.vault.outstandingPrincipal(), C.ADVANCE, "nothing settled");
    }

    /// Re-entering the vault during a withdrawal.
    function test_maliciousToken_cannotReenterVault() public {
        _deposit(C.LENDER_DEPOSIT);
        _hook()
            .arm(
                address(a.vault),
                abi.encodeWithSignature("withdraw(uint256,address,address)", 1, lender, lender)
            );
        vm.prank(lender);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        a.vault.withdraw(100_000, lender, lender);
    }

    /// Re-entering the JobWallet sweep during repayment.
    function test_maliciousToken_cannotReenterSweep() public {
        (bytes32 id, JobWallet jw) = _funded();
        vm.prank(buyer);
        token.approve(address(a.router), type(uint256).max);
        // the first transfer inside pay() is buyer → router; arm the hook to call sweep re-entrantly from the token
        _hook().arm(address(jw), abi.encodeCall(JobWallet.sweep, (address(this))));
        vm.prank(buyer);
        vm.expectRevert(JobWallet.NotController.selector); // token isn't a controller; sweep stays gated
        a.router.pay(id);
        assertFalse(jw.closed());
    }
}
