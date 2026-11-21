// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";
import {CreditFacility} from "../src/CreditFacility.sol";
import {ReceivableRegistry} from "../src/ReceivableRegistry.sol";
import {JobWallet} from "../src/JobWallet.sol";
import {RiskPricing} from "../src/libraries/RiskPricing.sol";
import {AutorailVault} from "../src/AutorailVault.sol";
import {JobWalletFactory} from "../src/JobWalletFactory.sol";
import {AutorailRoles} from "../src/AutorailRoles.sol";
import {IERC8004Reputation} from "../src/interfaces/IERC8004.sol";

contract CreditFacilityTest is Base {
    bytes32 internal id;

    function setUp() public override {
        super.setUp();
        _deposit(C.LENDER_DEPOSIT);
        id = _create();
        _confirm(id);
    }

    function _fundWith(CreditFacility.Offer memory o, uint256 key) internal returns (address) {
        bytes memory sig = _signOffer(o, key);
        vm.prank(seller);
        return a.facility.fund(o, sig);
    }

    function test_fund_happyPath() public {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        vm.expectEmit(true, true, false, true, address(a.facility));
        emit CreditFacility.Funded(id, a.factory.predict(id), C.ADVANCE, C.FEE);
        address jw = _fundWith(o, underwriterKey);
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Funded));
        CreditFacility.Advance memory adv = a.facility.advanceOf(id);
        assertEq(adv.jobWallet, jw);
        assertEq(adv.principal, C.ADVANCE);
        assertEq(adv.fee, C.FEE);
        assertEq(a.facility.outstandingOf(sellerAgent), C.ADVANCE);
        assertTrue(a.facility.offerNonceUsed(underwriter, o.nonce));
    }

    function test_fund_onlyTheSeller() public {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(rogue);
        vm.expectRevert(CreditFacility.NotSeller.selector);
        a.facility.fund(o, sig);
    }

    function test_fund_notConfirmed() public {
        bytes32 id2 = _createWith(keccak256("INV-UNCONFIRMED"), C.INVOICE_AMOUNT);
        CreditFacility.Offer memory o = _offer(id2, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(CreditFacility.NotConfirmed.selector);
        a.facility.fund(o, sig);
    }

    function test_fund_twiceReverts() public {
        _fundWith(_offer(id, C.ADVANCE, C.FEE_BPS), underwriterKey);
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(CreditFacility.InvalidState.selector, id, ReceivableRegistry.State.Funded)
        );
        a.facility.fund(o, sig);
    }

    function test_fund_offerExpired() public {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.warp(o.offerExpiry + 1);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.OfferExpired.selector, o.offerExpiry));
        a.facility.fund(o, sig);
    }

    function test_fund_noPayees() public {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        o.payees = new address[](0);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(CreditFacility.NoPayees.selector);
        a.facility.fund(o, sig);
    }

    function test_fund_signerMustBeUnderwriter() public {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, sellerKey); // seller signs its own offer
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.InvalidUnderwriter.selector, seller));
        a.facility.fund(o, sig);
    }

    function test_fund_tamperedOfferFails() public {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        o.payees[0] = rogue; // seller swaps a payee after signing
        vm.prank(seller);
        vm.expectRevert(); // recovers to some other address → InvalidUnderwriter(<random>)
        a.facility.fund(o, sig);
    }

    function test_fund_offerNonceReplay() public {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        _fundWith(o, underwriterKey);
        // same nonce on another receivable
        bytes32 id2 = _createWith(keccak256("INV-002"), 400_000);
        _confirm(id2);
        CreditFacility.Offer memory o2 = _offer(id2, 100_000, C.FEE_BPS);
        o2.nonce = o.nonce;
        bytes memory sig = _signOffer(o2, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.OfferNonceUsed.selector, o.nonce));
        a.facility.fund(o2, sig);
    }

    function test_fund_advanceAboveCap() public {
        uint256 tooMuch = C.ADVANCE + 1;
        CreditFacility.Offer memory o = _offer(id, tooMuch, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.AdvanceTooHigh.selector, tooMuch, C.ADVANCE));
        a.facility.fund(o, sig);
        CreditFacility.Offer memory zero = _offer(id, 0, C.FEE_BPS);
        sig = _signOffer(zero, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.AdvanceTooHigh.selector, 0, C.ADVANCE));
        a.facility.fund(zero, sig);
    }

    function test_fund_feeBelowFloor() public {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, 100);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.FeeBelowFloor.selector, 100, 200));
        a.facility.fund(o, sig);
    }

    function test_fund_sellerLimit() public {
        _fundWith(_offer(id, C.ADVANCE, C.FEE_BPS), underwriterKey); // 1.20 of the 1.50 limit
        token.mint(lender, 5_000_000);
        _deposit(5_000_000);
        bytes32 id2 = _createWith(keccak256("INV-002"), 1_000_000);
        _confirm(id2);
        (, uint256 maxAdvance) = a.facility.quote(id2);
        assertEq(maxAdvance, 300_000, "quote reflects the remaining headroom");
        CreditFacility.Offer memory o = _offer(id2, 750_000, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.OverSellerLimit.selector, 1_950_000, 1_500_000));
        a.facility.fund(o, sig);
    }

    function test_fund_vaultLiquidityIsChecked() public {
        // a 4.00 invoice: 75% = 3.00 > limit, so use a seller with history? simplest: drain idle first
        vm.prank(lender);
        a.vault.withdraw(1_000_000, lender, lender);
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(
            abi.encodeWithSelector(AutorailVault.InsufficientLiquidity.selector, C.ADVANCE, 210_000)
        );
        a.facility.fund(o, sig);
    }

    function test_fund_paused() public {
        a.facility.pause();
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        a.facility.fund(o, sig);
        a.facility.unpause();
        vm.prank(seller);
        a.facility.fund(o, sig);
    }

    // ─────────────── overdue / default ───────────────

    function test_markOverdue() public {
        _fundWith(_offer(id, C.ADVANCE, C.FEE_BPS), underwriterKey);
        uint256 at = a.registry.get(id).dueDate + a.facility.gracePeriod();
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.NotYet.selector, at));
        a.facility.markOverdue(id);
        vm.warp(at + 1);
        vm.prank(rogue); // permissionless
        a.facility.markOverdue(id);
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Overdue));
        vm.expectRevert(
            abi.encodeWithSelector(CreditFacility.InvalidState.selector, id, ReceivableRegistry.State.Overdue)
        );
        a.facility.markOverdue(id);
    }

    function test_markDefault_recoversWritesOffAndPenalises() public {
        JobWallet jw = JobWallet(_fundWith(_offer(id, C.ADVANCE, C.FEE_BPS), underwriterKey));
        _grant(jw);
        vm.prank(payout);
        jw.pay(annotatorA, C.PAY_A, "");
        uint256 at = a.registry.get(id).dueDate + a.facility.defaultPeriod();
        vm.expectRevert(abi.encodeWithSelector(CreditFacility.NotYet.selector, at));
        a.facility.markDefault(id);
        vm.warp(at + 1);
        uint256 idleBefore = a.vault.idle();
        vm.expectEmit(true, true, false, true, address(a.facility));
        emit CreditFacility.Defaulted(id, sellerAgent, C.ADVANCE, C.ADVANCE - C.PAY_A);
        vm.prank(rogue); // permissionless, straight from Funded
        a.facility.markDefault(id);
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Defaulted));
        assertEq(a.vault.idle() - idleBefore, C.ADVANCE - C.PAY_A, "JobWallet balance recovered");
        assertEq(a.vault.outstandingPrincipal(), 0);
        assertEq(a.vault.totalWrittenOff(), C.ADVANCE);
        assertEq(a.facility.creditOf(sellerAgent).defaults, 1);
        assertEq(a.facility.outstandingOf(sellerAgent), 0);
        // ERC-8004: 0 from the facility
        address[] memory clients = new address[](1);
        clients[0] = address(a.facility);
        (uint64 count, int128 value,) = a.reputation.getSummary(sellerAgent, clients, "credit", "defaulted");
        assertEq(count, 1);
        assertEq(value, 0);
        // band D now: no further advances
        bytes32 id2 = _createWith(keccak256("INV-AFTER-DEFAULT"), C.INVOICE_AMOUNT);
        _confirm(id2);
        (RiskPricing.Terms memory t, uint256 maxAdvance) = a.facility.quote(id2);
        assertEq(uint8(t.band), uint8(RiskPricing.Band.D));
        assertEq(maxAdvance, 0);
    }

    function test_markDefault_fromOverdue_andWrongStates() public {
        _fundWith(_offer(id, C.ADVANCE, C.FEE_BPS), underwriterKey);
        vm.warp(a.registry.get(id).dueDate + a.facility.gracePeriod() + 1);
        a.facility.markOverdue(id);
        vm.warp(a.registry.get(id).dueDate + a.facility.defaultPeriod() + 1);
        a.facility.markDefault(id);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreditFacility.InvalidState.selector, id, ReceivableRegistry.State.Defaulted
            )
        );
        a.facility.markDefault(id);
        // a confirmed-but-unfunded invoice can't default
        bytes32 id2 = _createWith(keccak256("INV-X"), 100_000);
        vm.warp(a.registry.get(id2).dueDate + a.facility.defaultPeriod() + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreditFacility.InvalidState.selector, id2, ReceivableRegistry.State.Created
            )
        );
        a.facility.markDefault(id2);
    }

    function test_markDefault_feedbackFailureDoesNotBlock() public {
        _fundWith(_offer(id, C.ADVANCE, C.FEE_BPS), underwriterKey);
        // the seller approves the facility as operator → ERC-8004 rejects the facility's feedback as "self"
        vm.prank(seller);
        a.identity.setApprovalForAll(address(a.facility), true);
        vm.warp(a.registry.get(id).dueDate + a.facility.defaultPeriod() + 1);
        vm.expectEmit(true, true, false, false, address(a.facility));
        emit CreditFacility.FeedbackFailed(id, sellerAgent);
        a.facility.markDefault(id);
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Defaulted));
    }

    // ─────────────── admin ───────────────

    function test_settleRepayment_onlyRouter() public {
        vm.expectRevert(CreditFacility.NotRouter.selector);
        a.facility.settleRepayment(id, true);
    }

    function test_admin() public {
        vm.expectRevert(CreditFacility.InvalidPeriods.selector);
        a.facility.setPeriods(0, 10);
        vm.expectRevert(CreditFacility.InvalidPeriods.selector);
        a.facility.setPeriods(10, 10);
        a.facility.setPeriods(C.GRACE_PERIOD, C.DEFAULT_PERIOD);
        assertEq(a.facility.gracePeriod(), C.GRACE_PERIOD);
        vm.expectRevert(CreditFacility.ZeroAddress.selector);
        a.facility.setRouter(address(0));
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rogue));
        a.facility.setPeriods(1, 2);
        vm.expectRevert(CreditFacility.ZeroAddress.selector);
        new CreditFacility(
            ReceivableRegistry(address(0)),
            a.vault,
            JobWalletFactory(address(a.factory)),
            AutorailRoles(address(a.roles)),
            IERC8004Reputation(address(a.reputation)),
            address(this)
        );
    }

    function test_domainSeparator() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Autorail CreditFacility"),
                keccak256("1"),
                block.chainid,
                address(a.facility)
            )
        );
        assertEq(a.facility.domainSeparator(), expected);
    }
}
