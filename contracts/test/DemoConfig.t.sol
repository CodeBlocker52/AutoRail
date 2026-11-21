// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";

/// @notice config/demo.json (read by the TypeScript e2e) and script/DemoConfig.sol must never drift apart.
contract DemoConfigTest is Test {
    function test_demoJsonMatchesSolidityConstants() public view {
        string memory j = vm.readFile("config/demo.json");
        assertEq(vm.parseJsonUint(j, ".vaultSeed"), C.VAULT_SEED);
        assertEq(vm.parseJsonUint(j, ".lenderDeposit"), C.LENDER_DEPOSIT);
        assertEq(vm.parseJsonUint(j, ".invoiceAmount"), C.INVOICE_AMOUNT);
        assertEq(vm.parseJsonUint(j, ".dueInSeconds"), C.DUE_IN);
        assertEq(vm.parseJsonUint(j, ".advanceBps"), C.ADVANCE_BPS);
        assertEq(vm.parseJsonUint(j, ".feeBps"), C.FEE_BPS);
        assertEq(vm.parseJsonUint(j, ".advance"), C.ADVANCE);
        assertEq(vm.parseJsonUint(j, ".fee"), C.FEE);
        assertEq(vm.parseJsonUint(j, ".perTxCap"), C.PER_TX_CAP);
        assertEq(vm.parseJsonUint(j, ".totalCap"), C.TOTAL_CAP);
        assertEq(vm.parseJsonUint(j, ".sessionTtlSeconds"), C.SESSION_TTL);
        assertEq(vm.parseJsonUint(j, ".payA"), C.PAY_A);
        assertEq(vm.parseJsonUint(j, ".payB"), C.PAY_B);
        assertEq(vm.parseJsonUint(j, ".payGpu"), C.PAY_GPU);
        assertEq(vm.parseJsonUint(j, ".blockedRogue"), C.BLOCKED_ROGUE);
        assertEq(vm.parseJsonUint(j, ".blockedOverCap"), C.BLOCKED_OVERCAP);
        assertEq(vm.parseJsonUint(j, ".blockedAfterRevoke"), C.BLOCKED_AFTER_REVOKE);
        assertEq(vm.parseJsonUint(j, ".expectVaultRepaid"), C.EXPECT_VAULT_REPAID);
        assertEq(vm.parseJsonUint(j, ".expectSellerRemainder"), C.EXPECT_SELLER_REMAINDER);
        assertEq(vm.parseJsonUint(j, ".expectSwept"), C.EXPECT_SWEPT);
        assertEq(vm.parseJsonUint(j, ".totalTusd8Needed"), C.TOTAL_TUSD8_NEEDED);
        assertEq(vm.parseJsonUint(j, ".gracePeriodSeconds"), C.GRACE_PERIOD);
        assertEq(vm.parseJsonUint(j, ".defaultPeriodSeconds"), C.DEFAULT_PERIOD);
        // internal consistency of the budget
        assertEq(C.ADVANCE, (C.INVOICE_AMOUNT * C.ADVANCE_BPS) / 10_000);
        assertEq(C.FEE, (C.ADVANCE * C.FEE_BPS) / 10_000);
        assertEq(C.TOTAL_CAP, C.PAY_A + C.PAY_B + C.PAY_GPU);
        assertEq(C.EXPECT_SWEPT, C.ADVANCE - C.TOTAL_CAP);
        assertEq(C.EXPECT_VAULT_REPAID, C.ADVANCE + C.FEE);
        assertEq(C.EXPECT_SELLER_REMAINDER, C.INVOICE_AMOUNT - C.EXPECT_VAULT_REPAID);
    }
}
