// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";
import {AutorailVault} from "../src/AutorailVault.sol";
import {Sigs} from "./utils/Sigs.sol";

contract AutorailVaultTest is Base {
    function _permitSig(uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        return Sigs.signPermit(
            vm,
            lenderKey,
            token.DOMAIN_SEPARATOR(),
            lender,
            address(a.vault),
            value,
            token.nonces(lender),
            deadline
        );
    }

    function test_metadata() public view {
        assertEq(a.vault.asset(), address(token));
        assertEq(a.vault.decimals(), 12, "6 asset decimals + 6 offset");
        assertEq(a.vault.symbol(), "avUSD8");
        assertEq(a.vault.balanceOf(C.DEAD), C.VAULT_SEED * 1e6, "dead shares seeded");
    }

    function test_depositWithPermit_oneSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(C.LENDER_DEPOSIT, deadline);
        vm.prank(lender);
        uint256 shares = a.vault.depositWithPermit(C.LENDER_DEPOSIT, lender, deadline, v, r, s);
        assertEq(a.vault.balanceOf(lender), shares);
        assertEq(a.vault.previewRedeem(shares), C.LENDER_DEPOSIT);
        assertEq(token.balanceOf(lender), 0);
    }

    function test_depositWithPermit_survivesFrontRunPermit() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(C.LENDER_DEPOSIT, deadline);
        // attacker submits the permit first; the deposit must still go through
        vm.prank(rogue);
        token.permit(lender, address(a.vault), C.LENDER_DEPOSIT, deadline, v, r, s);
        vm.prank(lender);
        a.vault.depositWithPermit(C.LENDER_DEPOSIT, lender, deadline, v, r, s);
        assertGt(a.vault.balanceOf(lender), 0);
    }

    function test_depositWithPermit_badPermitWithoutAllowanceReverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(C.LENDER_DEPOSIT, deadline);
        vm.prank(rogue); // rogue has no allowance; the permit is for lender, so it is swallowed and deposit fails
        vm.expectRevert();
        a.vault.depositWithPermit(C.LENDER_DEPOSIT, rogue, deadline, v, r, s);
    }

    function test_withdraw_cappedAtIdle() public {
        _funded(); // lends 1.20 of 1.21
        uint256 idle = a.vault.idle();
        assertEq(idle, C.VAULT_SEED);
        assertEq(a.vault.maxWithdraw(lender), idle, "only idle is withdrawable");
        assertLe(a.vault.maxRedeem(lender), a.vault.convertToShares(idle));
        vm.prank(lender);
        vm.expectRevert(
            abi.encodeWithSelector(
                ERC4626.ERC4626ExceededMaxWithdraw.selector, lender, C.LENDER_DEPOSIT, idle
            )
        );
        a.vault.withdraw(C.LENDER_DEPOSIT, lender, lender);
    }

    function test_withdrawAndRedeem_whenIdle() public {
        _deposit(C.LENDER_DEPOSIT);
        vm.startPrank(lender);
        a.vault.withdraw(400_000, lender, lender);
        a.vault.redeem(a.vault.balanceOf(lender), lender, lender);
        vm.stopPrank();
        assertApproxEqAbs(token.balanceOf(lender), C.LENDER_DEPOSIT, 1);
    }

    function test_totalAssets_isIdlePlusOutstanding() public {
        _funded();
        assertEq(a.vault.totalAssets(), a.vault.idle() + a.vault.outstandingPrincipal());
        assertEq(a.vault.outstandingPrincipal(), C.ADVANCE);
    }

    function test_lend_onlyFacility() public {
        vm.expectRevert(AutorailVault.NotFacility.selector);
        a.vault.lend(rogue, 1);
    }

    function test_lend_insufficientLiquidity_andZeroAddress() public {
        vm.startPrank(address(a.facility));
        vm.expectRevert(
            abi.encodeWithSelector(AutorailVault.InsufficientLiquidity.selector, 1e12, C.VAULT_SEED)
        );
        a.vault.lend(rogue, 1e12);
        vm.expectRevert(AutorailVault.ZeroAddress.selector);
        a.vault.lend(address(0), 1);
        vm.stopPrank();
    }

    function test_repay_onlyRouter_andBounded() public {
        vm.expectRevert(AutorailVault.NotRouter.selector);
        a.vault.repay(0, 0);
        vm.prank(address(a.router));
        vm.expectRevert(abi.encodeWithSelector(AutorailVault.RepayExceedsOutstanding.selector, 1, 0));
        a.vault.repay(1, 0);
    }

    function test_writeOff_dropsSharePrice() public {
        _funded();
        uint256 before = a.vault.convertToAssets(1e12);
        vm.prank(address(a.facility));
        a.vault.writeOff(C.ADVANCE);
        assertLt(a.vault.convertToAssets(1e12), before);
        assertEq(a.vault.totalWrittenOff(), C.ADVANCE);
        vm.expectRevert(AutorailVault.NotFacility.selector);
        a.vault.writeOff(1);
        vm.prank(address(a.facility));
        vm.expectRevert(abi.encodeWithSelector(AutorailVault.RepayExceedsOutstanding.selector, 1, 0));
        a.vault.writeOff(1);
    }

    function test_pause_blocksMoneyPaths() public {
        _deposit(C.LENDER_DEPOSIT);
        a.vault.pause();
        assertEq(a.vault.maxDeposit(lender), 0);
        assertEq(a.vault.maxMint(lender), 0);
        assertEq(a.vault.maxWithdraw(lender), 0);
        assertEq(a.vault.maxRedeem(lender), 0);
        vm.prank(address(a.facility));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        a.vault.lend(lender, 1);
        a.vault.unpause();
        assertGt(a.vault.maxWithdraw(lender), 0);
    }

    function test_admin_onlyOwnerAndNonZero() public {
        vm.startPrank(rogue);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rogue));
        a.vault.setFacility(rogue);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rogue));
        a.vault.pause();
        vm.stopPrank();
        vm.expectRevert(AutorailVault.ZeroAddress.selector);
        a.vault.setFacility(address(0));
        vm.expectRevert(AutorailVault.ZeroAddress.selector);
        a.vault.setRouter(address(0));
    }

    /// Classic inflation attack: first depositor donates to skew the price. The offset + dead shares make the
    /// victim lose at most dust.
    function test_inflationAttack_isUneconomic() public {
        AutorailVault fresh = new AutorailVault(IERC20(address(token)), address(this));
        address attacker = makeAddr("attacker");
        token.mint(attacker, 1_000_000_000);
        vm.startPrank(attacker);
        token.approve(address(fresh), type(uint256).max);
        fresh.deposit(1, attacker);
        token.transfer(address(fresh), 100_000_000); // donate 100 tUSD8
        vm.stopPrank();
        token.mint(lender, 10_000_000);
        vm.startPrank(lender);
        token.approve(address(fresh), 10_000_000);
        uint256 shares = fresh.deposit(10_000_000, lender);
        vm.stopPrank();
        assertGt(shares, 0, "victim gets shares");
        assertApproxEqRel(fresh.previewRedeem(shares), 10_000_000, 0.001e18, "victim loses < 0.1%");
    }
}
