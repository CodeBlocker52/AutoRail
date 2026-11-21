// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title RiskPricing
/// @notice Deterministic pricing rules. Credit record + buyer tier → risk band → max advance, fee floor and
///         seller limit. The underwriting agent signs offers inside these bounds; the CreditFacility enforces them.
/// @dev Amounts are tUSD8 units (6 decimals). Limits are scaled to the testnet demo budget.
library RiskPricing {
    enum Band {
        A,
        B,
        C,
        D
    }

    /// @notice A seller's repayment history, kept by the CreditFacility.
    struct CreditRecord {
        uint32 onTime;
        uint32 late;
        uint32 defaults;
    }

    struct Terms {
        Band band;
        uint16 maxAdvanceBps;
        uint16 feeBps;
        uint256 sellerLimit;
    }

    uint256 internal constant BPS = 10_000;
    /// @notice Starting outstanding-advance limit for a seller with no history (1.50 tUSD8).
    uint256 internal constant BASE_LIMIT = 1_500_000;
    /// @notice Limit increase per on-time repayment (0.50 tUSD8).
    uint256 internal constant LIMIT_STEP = 500_000;
    /// @notice Hard cap on any seller's limit (5.00 tUSD8).
    uint256 internal constant MAX_LIMIT = 5_000_000;

    /// @notice Risk band from history and buyer tier (1 = best, 3 = weakest, 0 = unrated).
    function band(CreditRecord memory c, uint8 buyerTier) internal pure returns (Band) {
        if (c.defaults > 0 || buyerTier == 0 || buyerTier > 3) return Band.D;
        if (buyerTier == 1 && c.onTime >= 2 && c.late == 0) return Band.A;
        if (buyerTier <= 2 && c.late <= c.onTime) return Band.B;
        return Band.C;
    }

    /// @notice Full terms for a seller/buyer pair.
    function terms(CreditRecord memory c, uint8 buyerTier) internal pure returns (Terms memory t) {
        t.band = band(c, buyerTier);
        if (t.band == Band.A) (t.maxAdvanceBps, t.feeBps) = (8_000, 150);
        else if (t.band == Band.B) (t.maxAdvanceBps, t.feeBps) = (7_500, 200);
        else if (t.band == Band.C) (t.maxAdvanceBps, t.feeBps) = (6_000, 300);
        else return t; // D: no advance
        t.sellerLimit = sellerLimit(c);
    }

    /// @notice Outstanding-advance limit: 1.50 + 0.50 per on-time repayment, capped at 5.00; 0 after a default.
    function sellerLimit(CreditRecord memory c) internal pure returns (uint256) {
        if (c.defaults > 0) return 0;
        uint256 l = BASE_LIMIT + uint256(c.onTime) * LIMIT_STEP;
        return l > MAX_LIMIT ? MAX_LIMIT : l;
    }

    /// @notice Fee on an advance, rounded up so lenders never get less than the rate.
    function feeOf(uint256 advance, uint16 feeBps) internal pure returns (uint256) {
        return (advance * feeBps + BPS - 1) / BPS;
    }
}
