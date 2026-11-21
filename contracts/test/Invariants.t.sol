// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Base} from "./Base.t.sol";
import {CreditFacility} from "../src/CreditFacility.sol";
import {ReceivableRegistry} from "../src/ReceivableRegistry.sol";
import {JobWallet} from "../src/JobWallet.sol";
import {RepaymentRouter} from "../src/RepaymentRouter.sol";
import {AutorailDeployer} from "../script/base/AutorailDeployer.sol";
import {MockTUSD8} from "./mocks/MockTUSD8.sol";
import {Sigs} from "./utils/Sigs.sol";

/// @notice Random lender / seller / agent / buyer / time actions against one deployed system.
contract Handler is Test {
    AutorailDeployer.Autorail internal a;
    MockTUSD8 internal token;
    address internal seller;
    address internal buyer;
    uint256 internal buyerKey;
    uint256 internal underwriterKey;
    address internal payout;
    address internal lender;
    uint256 internal buyerAgent;
    address[] internal payees;

    bytes32[] public ids;
    mapping(bytes32 => uint256) public repaidCount;
    uint256 public nonce;
    uint256 public time;
    // ghost: share price may only fall in a call that wrote principal off
    bool public priceDropWithoutWriteOff;
    uint256 public lastPrice;

    constructor(
        AutorailDeployer.Autorail memory a_,
        MockTUSD8 token_,
        address seller_,
        address buyer_,
        uint256 buyerKey_,
        uint256 underwriterKey_,
        address payout_,
        address lender_,
        uint256 buyerAgent_,
        address[] memory payees_
    ) {
        a = a_;
        token = token_;
        seller = seller_;
        buyer = buyer_;
        buyerKey = buyerKey_;
        underwriterKey = underwriterKey_;
        payout = payout_;
        lender = lender_;
        buyerAgent = buyerAgent_;
        payees = payees_;
        time = block.timestamp;
        lastPrice = a.vault.convertToAssets(1e12);
    }

    modifier trackPrice() {
        uint256 writtenOffBefore = a.vault.totalWrittenOff();
        _;
        uint256 p = a.vault.convertToAssets(1e12);
        if (p < lastPrice && a.vault.totalWrittenOff() == writtenOffBefore) priceDropWithoutWriteOff = true;
        lastPrice = p;
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function deposit(uint256 amount) external trackPrice {
        amount = bound(amount, 1, 5_000_000);
        token.mint(lender, amount);
        vm.startPrank(lender);
        token.approve(address(a.vault), amount);
        a.vault.deposit(amount, lender);
        vm.stopPrank();
    }

    function withdraw(uint256 amount) external trackPrice {
        uint256 max = a.vault.maxWithdraw(lender);
        if (max == 0) return;
        amount = bound(amount, 1, max);
        vm.prank(lender);
        a.vault.withdraw(amount, lender, lender);
    }

    function openInvoice(uint256 amount, uint256 advanceBps, uint128 perTx, uint128 total)
        external
        trackPrice
    {
        amount = bound(amount, 100, 2_000_000);
        vm.prank(seller);
        bytes32 id = a.registry
            .create(keccak256(abi.encode("inv", nonce++)), buyerAgent, amount, uint64(time + 60 days));
        uint256 d = time + 1 hours;
        uint256 n = a.registry.nonces(buyer);
        bytes memory sig =
            Sigs.sign(vm, buyerKey, a.registry.confirmationDigest(id, buyer, address(a.router), n, d));
        a.registry.confirm(id, buyer, address(a.router), d, sig);

        (, uint256 maxAdvance) = a.facility.quote(id);
        if (maxAdvance == 0) return;
        uint256 advance = bound(advanceBps, 1, maxAdvance);
        CreditFacility.Offer memory o = CreditFacility.Offer({
            receivableId: id,
            advanceAmount: advance,
            feeBps: 200,
            payees: payees,
            offerExpiry: uint64(time + 1 hours),
            nonce: nonce++
        });
        bytes memory osig = Sigs.sign(vm, underwriterKey, a.facility.offerDigest(o));
        vm.prank(seller);
        try a.facility.fund(o, osig) returns (address jwAddr) {
            ids.push(id);
            perTx = uint128(bound(perTx, 1, advance));
            total = uint128(bound(total, perTx, advance));
            vm.prank(seller);
            JobWallet(jwAddr).grantSession(payout, uint64(time + 1 days), perTx, total, payees);
        } catch {}
    }

    function spend(uint256 idx, uint256 amount) external trackPrice {
        if (ids.length == 0) return;
        bytes32 id = ids[idx % ids.length];
        JobWallet jw = JobWallet(a.facility.advanceOf(id).jobWallet);
        amount = bound(amount, 1, 2_000_000);
        vm.prank(payout);
        try jw.pay(payees[amount % payees.length], amount, "") {} catch {}
    }

    function repay(uint256 idx) external trackPrice {
        if (ids.length == 0) return;
        bytes32 id = ids[idx % ids.length];
        ReceivableRegistry.Receivable memory r = a.registry.get(id);
        token.mint(buyer, r.amount * 2);
        vm.startPrank(buyer);
        token.approve(address(a.router), r.amount * 2);
        try a.router.pay(id) {
            repaidCount[id]++;
        } catch {}
        try a.router.pay(id) {
            repaidCount[id]++; // must never happen
        } catch {}
        vm.stopPrank();
    }

    function defaultOne(uint256 idx) external trackPrice {
        if (ids.length == 0) return;
        bytes32 id = ids[idx % ids.length];
        ReceivableRegistry.Receivable memory r = a.registry.get(id);
        uint256 at = uint256(r.dueDate) + a.facility.defaultPeriod() + 1;
        if (at > time) {
            time = at;
            vm.warp(time);
        }
        try a.facility.markDefault(id) {} catch {}
    }

    function warp(uint256 dt) external trackPrice {
        time += bound(dt, 1, 30 days);
        vm.warp(time);
    }
}

contract InvariantsTest is Base {
    Handler internal h;

    function setUp() public override {
        super.setUp();
        h = new Handler(
            a, token, seller, buyer, buyerKey, underwriterKey, payout, lender, buyerAgent, _payees()
        );
        targetContract(address(h));
    }

    /// totalAssets is exactly idle tUSD8 + principal out on advances.
    function invariant_totalAssetsIsIdlePlusOutstanding() public view {
        assertEq(a.vault.totalAssets(), token.balanceOf(address(a.vault)) + a.vault.outstandingPrincipal());
    }

    /// Vault outstanding principal equals the facility's per-seller book.
    function invariant_outstandingMatchesFacilityBook() public view {
        assertEq(a.vault.outstandingPrincipal(), a.facility.outstandingOf(sellerAgent));
    }

    /// A session never spends more than its total cap.
    function invariant_sessionSpentWithinTotalCap() public view {
        for (uint256 i; i < h.idCount(); i++) {
            JobWallet jw = JobWallet(a.facility.advanceOf(h.ids(i)).jobWallet);
            JobWallet.Session memory s = jw.sessionOf(payout);
            assertLe(s.spent, s.totalCap);
        }
    }

    /// No receivable is ever repaid twice.
    function invariant_noDoubleRepayment() public view {
        for (uint256 i; i < h.idCount(); i++) {
            assertLe(h.repaidCount(h.ids(i)), 1);
        }
    }

    /// Share price only drops when principal is written off.
    function invariant_sharePriceOnlyDropsOnWriteOff() public view {
        assertFalse(h.priceDropWithoutWriteOff());
    }

    /// The router and the facility never hold tUSD8 between transactions.
    function invariant_routerAndFacilityHoldNothing() public view {
        assertEq(token.balanceOf(address(a.router)), 0);
        assertEq(token.balanceOf(address(a.facility)), 0);
    }
}
