// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Demo budget in tUSD8 units (6 decimals). Mirrors config/demo.json (asserted by test/DemoConfig.t.sol).
///         Scale every amount here and in demo.json together.
library DemoConfig {
    uint256 internal constant VAULT_SEED = 10_000; // 0.01, dead shares
    uint256 internal constant LENDER_DEPOSIT = 1_200_000; // 1.20
    uint256 internal constant INVOICE_AMOUNT = 1_600_000; // 1.60
    uint64 internal constant DUE_IN = 60 days;
    uint16 internal constant ADVANCE_BPS = 7_500;
    uint16 internal constant FEE_BPS = 200;
    uint256 internal constant ADVANCE = 1_200_000; // 75% of 1.60
    uint256 internal constant FEE = 24_000; // 2% of 1.20
    uint128 internal constant PER_TX_CAP = 500_000; // 0.50
    uint128 internal constant TOTAL_CAP = 1_100_000; // 1.10
    uint64 internal constant SESSION_TTL = 24 hours;
    uint256 internal constant PAY_A = 400_000;
    uint256 internal constant PAY_B = 400_000;
    uint256 internal constant PAY_GPU = 300_000;
    uint256 internal constant BLOCKED_ROGUE = 50_000;
    uint256 internal constant BLOCKED_OVERCAP = 600_000;
    uint256 internal constant BLOCKED_AFTER_REVOKE = 50_000;
    uint256 internal constant EXPECT_VAULT_REPAID = 1_224_000; // 1.20 + 0.024
    uint256 internal constant EXPECT_SELLER_REMAINDER = 376_000; // 1.60 − 1.224
    uint256 internal constant EXPECT_SWEPT = 100_000; // 1.20 − 1.10 spent
    uint256 internal constant TOTAL_TUSD8_NEEDED = VAULT_SEED + LENDER_DEPOSIT + INVOICE_AMOUNT; // 2.81
    uint64 internal constant GRACE_PERIOD = 10 minutes;
    uint64 internal constant DEFAULT_PERIOD = 30 minutes;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
}
