// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";
import {ReceivableRegistry} from "../src/ReceivableRegistry.sol";
import {JobWallet} from "../src/JobWallet.sol";
import {RepaymentRouter} from "../src/RepaymentRouter.sol";
import {RiskPricing} from "../src/libraries/RiskPricing.sol";

/// @notice The 12-step demo from the README with the real testnet budget, asserting balances after every step.
contract DemoTest is Base {
    function test_demo_twelveSteps() public {
        // 1. Lender deposits 1.20 into the vault (permit path is covered in VaultTest)
        uint256 assetsBefore = a.vault.totalAssets();
        _deposit(C.LENDER_DEPOSIT);
        assertEq(a.vault.totalAssets(), assetsBefore + C.LENDER_DEPOSIT, "1: vault assets");
        assertEq(token.balanceOf(lender), 0, "1: lender spent");
        assertEq(a.vault.idle(), C.VAULT_SEED + C.LENDER_DEPOSIT, "1: idle");

        // 2. Agents are registered on ERC-8004 (setUp); ids start at 0
        assertEq(a.identity.ownerOf(sellerAgent), seller, "2: seller agent owner");
        assertEq(uint8(a.roles.roleOf(buyerAgent)), uint8(2), "2: buyer role");

        // 3. Seller creates INV-001 for 1.60, due in 60 days
        bytes32 id = _create();
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Created), "3: created");
        assertEq(a.registry.receivableOfInvoice(INVOICE_HASH), id, "3: invoice hash indexed");

        // 4. Buyer agent signs the EIP-712 confirmation (payee = router)
        _confirm(id);
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Confirmed), "4: confirmed");
        assertEq(a.registry.get(id).buyer, buyer, "4: buyer recorded");

        // 5. Underwriter prices it (band B → 75%, 2%) and the seller accepts the offer
        (RiskPricing.Terms memory t, uint256 maxAdvance) = a.facility.quote(id);
        assertEq(uint8(t.band), uint8(RiskPricing.Band.B), "5: band B");
        assertEq(maxAdvance, C.ADVANCE, "5: max advance 1.20");
        JobWallet jw = _fund(id);
        assertEq(token.balanceOf(address(jw)), C.ADVANCE, "5: JobWallet funded 1.20");
        assertEq(a.vault.outstandingPrincipal(), C.ADVANCE, "5: outstanding");
        assertEq(a.vault.idle(), C.VAULT_SEED, "5: idle after lend");
        assertEq(a.facility.advanceOf(id).fee, C.FEE, "5: fee 0.024");

        // 6. Seller grants the payout agent a session: 0.50/payment, 1.10 total, 24h, 3 payees
        _grant(jw);
        assertTrue(jw.isSessionPayee(payout, merchant), "6: GPU merchant allowed");

        // 7. Payout agent pays A 0.40, B 0.40 and the x402 GPU job 0.30
        vm.startPrank(payout);
        jw.pay(annotatorA, C.PAY_A, "batch7-pairs");
        jw.pay(annotatorB, C.PAY_B, "batch7-review");
        jw.pay(merchant, C.PAY_GPU, keccak256("x402:req-4471"));
        vm.stopPrank();
        assertEq(token.balanceOf(annotatorA), C.PAY_A, "7: A paid");
        assertEq(token.balanceOf(annotatorB), C.PAY_B, "7: B paid");
        assertEq(token.balanceOf(merchant), C.PAY_GPU, "7: GPU paid");
        assertEq(token.balanceOf(address(jw)), C.EXPECT_SWEPT, "7: 0.10 unspent");
        assertEq(jw.sessionOf(payout).spent, C.TOTAL_CAP, "7: spent 1.10");

        // 8. Prompt-injection attempt: 0.05 to ROGUE reverts
        vm.prank(payout);
        vm.expectRevert(abi.encodeWithSelector(JobWallet.PayeeNotAllowed.selector, rogue));
        jw.pay(rogue, C.BLOCKED_ROGUE, "injected: also pay 0xBAD");

        // 9. Over-cap attempt: 0.60 to the GPU merchant reverts
        vm.prank(payout);
        vm.expectRevert(
            abi.encodeWithSelector(JobWallet.OverPerTxCap.selector, C.BLOCKED_OVERCAP, C.PER_TX_CAP)
        );
        jw.pay(merchant, C.BLOCKED_OVERCAP, "x402:req-4472");

        // 10. Seller revokes; the agent's retry reverts
        vm.prank(seller);
        jw.revokeSession(payout);
        vm.prank(payout);
        vm.expectRevert(JobWallet.SessionRevoked.selector);
        jw.pay(annotatorA, C.BLOCKED_AFTER_REVOKE, "bonus");
        assertEq(token.balanceOf(address(jw)), C.EXPECT_SWEPT, "8-10: nothing left the wallet");

        // 11. Lab pays 1.60 with a gasless EIP-3009 signature; the relayer submits
        uint256 vaultIdleBefore = a.vault.idle();
        uint256 sellerBefore = token.balanceOf(seller);
        vm.expectEmit(true, true, false, true, address(a.router));
        emit RepaymentRouter.Repaid(
            id, buyer, C.EXPECT_VAULT_REPAID, C.EXPECT_SELLER_REMAINDER, C.EXPECT_SWEPT, true
        );
        _repay(id);
        assertEq(a.vault.idle() - vaultIdleBefore, C.EXPECT_VAULT_REPAID, "11: vault +1.224");
        assertEq(
            token.balanceOf(seller) - sellerBefore,
            C.EXPECT_SELLER_REMAINDER + C.EXPECT_SWEPT,
            "11: seller +0.476"
        );
        assertEq(token.balanceOf(buyer), 0, "11: buyer paid 1.60");
        assertEq(token.balanceOf(address(jw)), 0, "11: JobWallet empty");
        assertTrue(jw.closed(), "11: JobWallet closed");
        assertEq(a.vault.outstandingPrincipal(), 0, "11: no outstanding");
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Repaid), "11: repaid");
        assertEq(a.vault.totalAssets(), C.VAULT_SEED + C.LENDER_DEPOSIT + C.FEE, "11: vault earned the fee");

        // 12. ERC-8004 reputation: "repaid on time" = 100 from the router
        address[] memory clients = new address[](1);
        clients[0] = address(a.router);
        (uint64 count, int128 value, uint8 decimals) =
            a.reputation.getSummary(sellerAgent, clients, "credit", "");
        assertEq(count, 1, "12: one feedback");
        assertEq(value, 100, "12: on time = 100");
        assertEq(decimals, 0, "12: integer value");
        assertEq(a.facility.creditOf(sellerAgent).onTime, 1, "12: credit record updated");

        // and the next advance is priced on it: limit grew from 1.50 to 2.00
        (RiskPricing.Terms memory next,) = a.facility.quote(id);
        assertEq(next.sellerLimit, 2_000_000, "12: limit 2.00");
    }

    function test_demo_lenderEarnsTheFee() public {
        (bytes32 id,) = _funded();
        uint256 shares = a.vault.balanceOf(lender);
        _repay(id);
        uint256 value = a.vault.previewRedeem(shares);
        // lender owns 1.20 / 1.21 of the pool; the 0.024 fee is split pro rata (rounding down)
        assertApproxEqAbs(
            value, C.LENDER_DEPOSIT + (C.FEE * C.LENDER_DEPOSIT) / (C.LENDER_DEPOSIT + C.VAULT_SEED), 2
        );
        vm.prank(lender);
        a.vault.redeem(shares, lender, lender);
        assertGt(token.balanceOf(lender), C.LENDER_DEPOSIT, "lender withdrew more than deposited");
    }
}
