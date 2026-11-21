// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";
import {RepaymentRouter} from "../src/RepaymentRouter.sol";
import {ReceivableRegistry} from "../src/ReceivableRegistry.sol";
import {CreditFacility} from "../src/CreditFacility.sol";
import {AutorailVault} from "../src/AutorailVault.sol";
import {JobWallet} from "../src/JobWallet.sol";
import {IERC8004Reputation} from "../src/interfaces/IERC8004.sol";
import {MockTUSD8} from "./mocks/MockTUSD8.sol";

contract RepaymentRouterTest is Base {
    bytes32 internal id;
    JobWallet internal jw;

    function setUp() public override {
        super.setUp();
        (id, jw) = _funded();
    }

    function _sigFor(uint256 key, address from, uint256 value, bytes32 nonce)
        internal
        view
        returns (uint8, bytes32, bytes32, uint256)
    {
        uint256 vb = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _payAuth(key, from, value, nonce, vb);
        return (v, r, s, vb);
    }

    function test_authorizationNonce_isBoundToRouterAndReceivable() public view {
        assertEq(a.router.authorizationNonce(id), keccak256(abi.encode(address(a.router), id)));
        assertTrue(a.router.authorizationNonce(id) != a.router.authorizationNonce(keccak256("other")));
    }

    function test_payWithAuthorization_happyPath_relayerPaysNoTokens() public {
        uint256 relayerBefore = token.balanceOf(relayer);
        _repay(id);
        assertEq(token.balanceOf(relayer), relayerBefore);
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Repaid));
        assertTrue(token.authorizationState(buyer, a.router.authorizationNonce(id)));
    }

    function test_secondPaymentReverts_AlreadyRepaid() public {
        _repay(id);
        token.mint(buyer, C.INVOICE_AMOUNT);
        bytes32 nonce = a.router.authorizationNonce(id);
        (uint8 v, bytes32 r, bytes32 s, uint256 vb) = _sigFor(buyerKey, buyer, C.INVOICE_AMOUNT, nonce);
        vm.expectRevert(abi.encodeWithSelector(RepaymentRouter.AlreadyRepaid.selector, id));
        a.router.payWithAuthorization(id, buyer, C.INVOICE_AMOUNT, 0, vb, nonce, v, r, s);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(RepaymentRouter.AlreadyRepaid.selector, id));
        a.router.pay(id);
    }

    function test_wrongAmount() public {
        bytes32 nonce = a.router.authorizationNonce(id);
        uint256 less = C.INVOICE_AMOUNT - 1;
        (uint8 v, bytes32 r, bytes32 s, uint256 vb) = _sigFor(buyerKey, buyer, less, nonce);
        vm.expectRevert(abi.encodeWithSelector(RepaymentRouter.WrongAmount.selector, less, C.INVOICE_AMOUNT));
        a.router.payWithAuthorization(id, buyer, less, 0, vb, nonce, v, r, s);
    }

    function test_nonceNotBoundToReceivableIsRejected() public {
        bytes32 random = keccak256("buyer picked its own nonce");
        (uint8 v, bytes32 r, bytes32 s, uint256 vb) = _sigFor(buyerKey, buyer, C.INVOICE_AMOUNT, random);
        vm.expectRevert(
            abi.encodeWithSelector(
                RepaymentRouter.WrongNonce.selector, random, a.router.authorizationNonce(id)
            )
        );
        a.router.payWithAuthorization(id, buyer, C.INVOICE_AMOUNT, 0, vb, random, v, r, s);
    }

    function test_onlyTheConfirmingBuyerCanPay() public {
        token.mint(rogue, C.INVOICE_AMOUNT);
        bytes32 nonce = a.router.authorizationNonce(id);
        (uint8 v, bytes32 r, bytes32 s, uint256 vb) = _sigFor(buyerKey, rogue, C.INVOICE_AMOUNT, nonce);
        vm.expectRevert(abi.encodeWithSelector(RepaymentRouter.NotBuyer.selector, rogue, buyer));
        a.router.payWithAuthorization(id, rogue, C.INVOICE_AMOUNT, 0, vb, nonce, v, r, s);
    }

    function test_wrongSignerOrExpiredAuthorization() public {
        bytes32 nonce = a.router.authorizationNonce(id);
        (uint8 v, bytes32 r, bytes32 s, uint256 vb) = _sigFor(sellerKey, buyer, C.INVOICE_AMOUNT, nonce);
        vm.expectRevert(MockTUSD8.InvalidSignature.selector);
        a.router.payWithAuthorization(id, buyer, C.INVOICE_AMOUNT, 0, vb, nonce, v, r, s);
        (v, r, s, vb) = _sigFor(buyerKey, buyer, C.INVOICE_AMOUNT, nonce);
        vm.warp(vb);
        vm.expectRevert(MockTUSD8.AuthorizationExpired.selector);
        a.router.payWithAuthorization(id, buyer, C.INVOICE_AMOUNT, 0, vb, nonce, v, r, s);
    }

    function test_authorizationCantBeRedirectedToAnotherInvoice() public {
        // a signature for invoice A can't pay invoice B, even with the same amount
        bytes32 id2 = _createWith(keccak256("INV-002"), C.INVOICE_AMOUNT);
        bytes32 nonceA = a.router.authorizationNonce(id);
        (uint8 v, bytes32 r, bytes32 s, uint256 vb) = _sigFor(buyerKey, buyer, C.INVOICE_AMOUNT, nonceA);
        vm.expectRevert(
            abi.encodeWithSelector(RepaymentRouter.NotPayable.selector, id2, ReceivableRegistry.State.Created)
        );
        a.router.payWithAuthorization(id2, buyer, C.INVOICE_AMOUNT, 0, vb, nonceA, v, r, s);
    }

    function test_notPayableBeforeFunding() public {
        bytes32 id2 = _createWith(keccak256("INV-CONFIRMED-ONLY"), 400_000);
        _confirm(id2);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                RepaymentRouter.NotPayable.selector, id2, ReceivableRegistry.State.Confirmed
            )
        );
        a.router.pay(id2);
    }

    function test_payFallback_withApprove() public {
        vm.startPrank(buyer);
        token.approve(address(a.router), C.INVOICE_AMOUNT);
        a.router.pay(id);
        vm.stopPrank();
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Repaid));
        assertEq(a.vault.outstandingPrincipal(), 0);
    }

    function test_latePayment_isRecordedLate() public {
        vm.warp(a.registry.get(id).dueDate + 1);
        vm.prank(buyer);
        token.approve(address(a.router), C.INVOICE_AMOUNT);
        vm.expectEmit(true, true, false, true, address(a.router));
        emit RepaymentRouter.Repaid(
            id, buyer, C.EXPECT_VAULT_REPAID, C.EXPECT_SELLER_REMAINDER, C.ADVANCE, false
        );
        vm.prank(buyer);
        a.router.pay(id);
        assertEq(a.facility.creditOf(sellerAgent).late, 1);
        address[] memory clients = new address[](1);
        clients[0] = address(a.router);
        (, int128 value,) = a.reputation.getSummary(sellerAgent, clients, "credit", "repaid_late");
        assertEq(value, 50);
    }

    function test_overdueThenRepaid() public {
        vm.warp(a.registry.get(id).dueDate + a.facility.gracePeriod() + 1);
        a.facility.markOverdue(id);
        _repay(id);
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Repaid));
    }

    function test_feedbackFailureDoesNotBlockRepayment() public {
        vm.prank(seller);
        a.identity.setApprovalForAll(address(a.router), true); // router becomes an operator → "self-feedback"
        vm.expectEmit(true, true, false, false, address(a.router));
        emit RepaymentRouter.FeedbackFailed(id, sellerAgent);
        _repay(id);
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Repaid));
    }

    function test_paused() public {
        a.router.pause();
        vm.prank(buyer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        a.router.pay(id);
        a.router.unpause();
        _repay(id);
    }

    function test_constructor_rejectsZero() public {
        vm.expectRevert(RepaymentRouter.ZeroAddress.selector);
        new RepaymentRouter(
            IERC20(address(0)),
            a.registry,
            a.facility,
            a.vault,
            IERC8004Reputation(address(a.reputation)),
            address(this)
        );
    }

    // ─────────────── fuzz: waterfall conservation ───────────────

    /// For any invoice, advance (within the band cap) and spend, nothing is created or lost:
    /// buyer's payment == vault gain + seller gain − swept, and swept == advance − spent.
    function testFuzz_waterfallConservesEveryUnit(uint256 invoice, uint256 advanceBps, uint256 spend) public {
        invoice = bound(invoice, 10, 2_000_000);
        advanceBps = bound(advanceBps, 1, 7_500);
        uint256 advance = (invoice * advanceBps) / 10_000;
        vm.assume(advance > 0);
        spend = bound(spend, 0, advance);

        bytes32 fid = _createWith(keccak256(abi.encode("fuzz", invoice, advanceBps, spend)), invoice);
        _confirm(fid);
        token.mint(lender, advance);
        _deposit(advance);
        CreditFacility.Offer memory o = _offer(fid, advance, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        (bool ok, bytes memory ret) = address(a.facility).call(abi.encodeCall(CreditFacility.fund, (o, sig)));
        vm.assume(ok); // skip combos rejected by the seller limit (already funded INV-001)
        JobWallet w = JobWallet(abi.decode(ret, (address)));
        if (spend > 0) {
            vm.prank(seller);
            w.pay(annotatorA, spend, "");
        }
        token.mint(buyer, invoice);
        uint256 vault0 = token.balanceOf(address(a.vault));
        uint256 seller0 = token.balanceOf(seller);
        uint256 buyer0 = token.balanceOf(buyer);
        uint256 supply0 = token.totalSupply();

        vm.startPrank(buyer);
        token.approve(address(a.router), invoice);
        a.router.pay(fid);
        vm.stopPrank();

        uint256 fee = a.facility.advanceOf(fid).fee;
        uint256 vaultGain = token.balanceOf(address(a.vault)) - vault0;
        uint256 sellerGain = token.balanceOf(seller) - seller0;
        assertEq(buyer0 - token.balanceOf(buyer), invoice, "buyer paid exactly the invoice");
        assertEq(vaultGain, advance + fee, "lenders first: principal + fee");
        assertEq(sellerGain, invoice - advance - fee + (advance - spend), "remainder + swept to seller");
        assertEq(token.totalSupply(), supply0, "no tokens created or destroyed");
        assertEq(token.balanceOf(address(a.router)), 0, "router keeps nothing");
        assertEq(token.balanceOf(address(w)), 0, "JobWallet empty");
    }
}
