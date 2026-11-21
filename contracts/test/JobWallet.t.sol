// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";
import {JobWallet} from "../src/JobWallet.sol";
import {JobWalletFactory} from "../src/JobWalletFactory.sol";

contract JobWalletTest is Base {
    bytes32 internal id;
    JobWallet internal jw;

    function setUp() public override {
        super.setUp();
        (id, jw) = _funded();
    }

    function _one(address p) internal pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = p;
    }

    // ─────────────── init ───────────────

    function test_initialized() public view {
        assertEq(jw.owner(), seller);
        assertEq(jw.receivableId(), id);
        assertEq(address(jw.token()), address(token));
        assertEq(jw.facility(), address(a.facility));
        assertEq(jw.router(), address(a.router));
        assertEq(jw.approvedPayees().length, 3);
        assertEq(jw.balance(), C.ADVANCE);
        assertEq(a.factory.walletOf(id), address(jw));
        assertEq(a.factory.predict(id), address(jw));
    }

    function test_initialize_onlyOnce() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        jw.initialize(rogue, id, IERC20(address(token)), _payees(), rogue, rogue);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        a.jobWalletImpl.initialize(rogue, id, IERC20(address(token)), _payees(), rogue, rogue);
    }

    function test_initialize_rejectsZeroAddresses() public {
        // via factory with a fresh wallet: a zero payee
        address[] memory bad = new address[](1);
        vm.prank(address(a.facility));
        vm.expectRevert(JobWallet.ZeroAddress.selector);
        a.factory.create(keccak256("x"), seller, bad);
        vm.prank(address(a.facility));
        vm.expectRevert(JobWallet.ZeroAddress.selector);
        a.factory.create(keccak256("y"), address(0), _payees());
    }

    function test_initialize_dedupesPayees() public {
        address[] memory dup = new address[](2);
        dup[0] = annotatorA;
        dup[1] = annotatorA;
        vm.prank(address(a.facility));
        JobWallet w = JobWallet(a.factory.create(keccak256("dup"), seller, dup));
        assertEq(w.approvedPayees().length, 1);
    }

    // ─────────────── sessions ───────────────

    function test_grant_onlyOwner() public {
        vm.prank(rogue);
        vm.expectRevert(JobWallet.NotOwner.selector);
        jw.grantSession(payout, uint64(block.timestamp + 1), 1, 1, _payees());
    }

    function test_grant_validation() public {
        uint64 exp = uint64(block.timestamp + 1 hours);
        vm.startPrank(seller);
        vm.expectRevert(JobWallet.ZeroAddress.selector);
        jw.grantSession(address(0), exp, 1, 1, _payees());
        vm.expectRevert(JobWallet.InvalidSession.selector);
        jw.grantSession(payout, uint64(block.timestamp), 1, 1, _payees());
        vm.expectRevert(JobWallet.InvalidSession.selector);
        jw.grantSession(payout, exp, 0, 1, _payees());
        vm.expectRevert(JobWallet.InvalidSession.selector);
        jw.grantSession(payout, exp, 1, 0, _payees());
        vm.expectRevert(JobWallet.InvalidSession.selector);
        jw.grantSession(payout, exp, 2, 1, _payees());
        vm.expectRevert(JobWallet.InvalidSession.selector);
        jw.grantSession(payout, exp, 1, 1, new address[](0));
        vm.expectRevert(abi.encodeWithSelector(JobWallet.PayeeNotAllowed.selector, rogue));
        jw.grantSession(payout, exp, 1, 1, _one(rogue));
        vm.stopPrank();
    }

    function test_regrant_resetsSpentAndPayees() public {
        _grant(jw);
        vm.prank(payout);
        jw.pay(annotatorA, C.PAY_A, "");
        vm.prank(seller);
        jw.grantSession(payout, uint64(block.timestamp + 1 hours), 100, 200, _one(annotatorB));
        JobWallet.Session memory s = jw.sessionOf(payout);
        assertEq(s.spent, 0);
        assertEq(s.version, 2);
        assertFalse(jw.isSessionPayee(payout, annotatorA), "old payees cleared");
        assertTrue(jw.isSessionPayee(payout, annotatorB));
        vm.prank(payout);
        vm.expectRevert(abi.encodeWithSelector(JobWallet.PayeeNotAllowed.selector, annotatorA));
        jw.pay(annotatorA, 50, "");
    }

    function test_revoke() public {
        vm.startPrank(seller);
        vm.expectRevert(abi.encodeWithSelector(JobWallet.NoSession.selector, payout));
        jw.revokeSession(payout);
        jw.grantSession(payout, uint64(block.timestamp + 1 hours), 1, 1, _payees());
        vm.expectEmit(true, false, false, false, address(jw));
        emit JobWallet.SessionKeyRevoked(payout);
        jw.revokeSession(payout);
        vm.expectRevert(JobWallet.SessionRevoked.selector);
        jw.revokeSession(payout);
        vm.stopPrank();
        vm.prank(rogue);
        vm.expectRevert(JobWallet.NotOwner.selector);
        jw.revokeSession(payout);
    }

    // ─────────────── pay: check order and every revert ───────────────

    function test_pay_checkOrder() public {
        // a call that breaks every rule reports them in the documented order.
        // (track time in a local: the optimizer may reuse a TIMESTAMP read across vm.warp)
        uint256 t = block.timestamp;
        vm.prank(seller);
        jw.grantSession(payout, uint64(t + 1 hours), 100, 150, _one(annotatorA));
        vm.prank(payout);
        jw.pay(annotatorA, 100, ""); // spent 100 of 150

        vm.prank(seller);
        jw.revokeSession(payout);
        t += 2 hours;
        vm.warp(t);
        vm.prank(payout);
        vm.expectRevert(JobWallet.SessionRevoked.selector); // 1st: revoked (even though also expired etc.)
        jw.pay(rogue, 1_000_000, "");

        vm.prank(seller);
        jw.grantSession(payout, uint64(t + 1 hours), 100, 150, _one(annotatorA));
        vm.prank(payout);
        jw.pay(annotatorA, 100, "");
        t += 2 hours;
        vm.warp(t);
        vm.prank(payout);
        vm.expectRevert(JobWallet.SessionExpired.selector); // 2nd: expired
        jw.pay(rogue, 1_000_000, "");

        vm.prank(seller);
        jw.grantSession(payout, uint64(t + 1 hours), 100, 150, _one(annotatorA));
        vm.prank(payout);
        jw.pay(annotatorA, 100, "");
        vm.startPrank(payout);
        vm.expectRevert(abi.encodeWithSelector(JobWallet.PayeeNotAllowed.selector, rogue)); // 3rd
        jw.pay(rogue, 1_000_000, "");
        vm.expectRevert(abi.encodeWithSelector(JobWallet.OverPerTxCap.selector, 1_000_000, 100)); // 4th
        jw.pay(annotatorA, 1_000_000, "");
        vm.expectRevert(abi.encodeWithSelector(JobWallet.OverTotalCap.selector, 200, 150)); // 5th
        jw.pay(annotatorA, 100, "");
        vm.stopPrank();
    }

    function test_pay_noSessionAndZero() public {
        vm.startPrank(rogue);
        vm.expectRevert(abi.encodeWithSelector(JobWallet.NoSession.selector, rogue));
        jw.pay(annotatorA, 1, "");
        vm.expectRevert(JobWallet.ZeroAmount.selector);
        jw.pay(annotatorA, 0, "");
        vm.stopPrank();
    }

    function test_pay_insufficientBalance() public {
        vm.prank(seller);
        jw.grantSession(payout, uint64(block.timestamp + 1 hours), 2_000_000, 3_000_000, _payees());
        vm.prank(payout);
        vm.expectRevert(abi.encodeWithSelector(JobWallet.InsufficientBalance.selector, 2_000_000, C.ADVANCE));
        jw.pay(annotatorA, 2_000_000, "");
    }

    function test_pay_ownerPath_approvedPayeesOnly() public {
        vm.startPrank(seller);
        jw.pay(annotatorA, 10, "owner");
        vm.expectRevert(abi.encodeWithSelector(JobWallet.PayeeNotAllowed.selector, seller));
        jw.pay(seller, 10, "owner pays itself");
        vm.stopPrank();
        assertEq(token.balanceOf(annotatorA), 10);
    }

    function test_pay_emitsPaidWithMemo() public {
        _grant(jw);
        bytes32 memo = keccak256("x402:req-4471");
        vm.expectEmit(true, true, false, true, address(jw));
        emit JobWallet.Paid(payout, merchant, C.PAY_GPU, memo);
        vm.prank(payout);
        jw.pay(merchant, C.PAY_GPU, memo);
    }

    // ─────────────── sweep ───────────────

    function test_sweep_onlyControllers_andCloses() public {
        vm.expectRevert(JobWallet.NotController.selector);
        jw.sweep(rogue);
        vm.prank(address(a.router));
        vm.expectRevert(JobWallet.ZeroAddress.selector);
        jw.sweep(address(0));
        vm.prank(address(a.facility));
        uint256 out = jw.sweep(seller);
        assertEq(out, C.ADVANCE);
        assertTrue(jw.closed());
        vm.prank(seller);
        vm.expectRevert(JobWallet.Closed.selector);
        jw.pay(annotatorA, 1, "");
        vm.prank(seller);
        vm.expectRevert(JobWallet.Closed.selector);
        jw.grantSession(payout, uint64(block.timestamp + 1), 1, 1, _payees());
        vm.prank(address(a.router));
        assertEq(jw.sweep(seller), 0, "second sweep moves nothing");
    }

    // ─────────────── fuzz: session caps ───────────────

    /// Whatever the agent tries, it never spends more than perTxCap per payment or totalCap in total.
    function testFuzz_sessionCapsHold(uint128 perTx, uint128 total, uint256[8] calldata tries) public {
        perTx = uint128(bound(perTx, 1, C.ADVANCE));
        total = uint128(bound(total, perTx, C.ADVANCE));
        vm.prank(seller);
        jw.grantSession(payout, uint64(block.timestamp + 1 hours), perTx, total, _payees());
        uint256 paid;
        for (uint256 i; i < tries.length; i++) {
            uint256 amt = bound(tries[i], 1, C.ADVANCE);
            vm.prank(payout);
            try jw.pay(annotatorA, amt, "") {
                assertLe(amt, perTx, "per-tx cap");
                paid += amt;
            } catch {}
        }
        assertLe(paid, total, "total cap");
        assertEq(jw.sessionOf(payout).spent, paid);
        assertEq(token.balanceOf(annotatorA), paid);
    }

    // ─────────────── factory ───────────────

    function test_factory_guards() public {
        vm.expectRevert(JobWalletFactory.NotFacility.selector);
        a.factory.create(keccak256("z"), seller, _payees());
        vm.prank(address(a.facility));
        vm.expectRevert(abi.encodeWithSelector(JobWalletFactory.AlreadyCreated.selector, id));
        a.factory.create(id, seller, _payees());
        vm.expectRevert(JobWalletFactory.ZeroAddress.selector);
        a.factory.setWiring(address(0), rogue);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rogue));
        a.factory.setWiring(rogue, rogue);
        vm.expectRevert(JobWalletFactory.ZeroAddress.selector);
        new JobWalletFactory(address(0), IERC20(address(token)), address(this));
    }
}
