// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {RiskPricing} from "../src/libraries/RiskPricing.sol";

contract RiskPricingTest is Test {
    function _rec(uint32 onTime, uint32 late, uint32 defaults)
        internal
        pure
        returns (RiskPricing.CreditRecord memory)
    {
        return RiskPricing.CreditRecord(onTime, late, defaults);
    }

    function test_newSellerTierOneIsBandB() public pure {
        RiskPricing.Terms memory t = RiskPricing.terms(_rec(0, 0, 0), 1);
        assertEq(uint8(t.band), uint8(RiskPricing.Band.B));
        assertEq(t.maxAdvanceBps, 7_500);
        assertEq(t.feeBps, 200);
        assertEq(t.sellerLimit, 1_500_000);
    }

    function test_bands() public pure {
        assertEq(uint8(RiskPricing.band(_rec(2, 0, 0), 1)), uint8(RiskPricing.Band.A));
        assertEq(uint8(RiskPricing.band(_rec(2, 0, 0), 2)), uint8(RiskPricing.Band.B));
        assertEq(uint8(RiskPricing.band(_rec(1, 2, 0), 1)), uint8(RiskPricing.Band.C));
        assertEq(uint8(RiskPricing.band(_rec(0, 0, 0), 3)), uint8(RiskPricing.Band.C));
        assertEq(uint8(RiskPricing.band(_rec(9, 0, 1), 1)), uint8(RiskPricing.Band.D));
        assertEq(uint8(RiskPricing.band(_rec(0, 0, 0), 0)), uint8(RiskPricing.Band.D));
        assertEq(uint8(RiskPricing.band(_rec(0, 0, 0), 4)), uint8(RiskPricing.Band.D));
    }

    function test_termsPerBand() public pure {
        RiskPricing.Terms memory t = RiskPricing.terms(_rec(2, 0, 0), 1);
        assertEq(t.maxAdvanceBps, 8_000);
        assertEq(t.feeBps, 150);
        t = RiskPricing.terms(_rec(0, 0, 0), 3);
        assertEq(t.maxAdvanceBps, 6_000);
        assertEq(t.feeBps, 300);
        t = RiskPricing.terms(_rec(0, 0, 1), 1);
        assertEq(t.maxAdvanceBps, 0);
        assertEq(t.sellerLimit, 0);
    }

    function test_limitGrowsAndCaps() public pure {
        assertEq(RiskPricing.sellerLimit(_rec(1, 0, 0)), 2_000_000);
        assertEq(RiskPricing.sellerLimit(_rec(7, 0, 0)), 5_000_000);
        assertEq(RiskPricing.sellerLimit(_rec(100, 0, 0)), 5_000_000);
        assertEq(RiskPricing.sellerLimit(_rec(100, 0, 1)), 0);
    }

    function test_feeRoundsUp() public pure {
        assertEq(RiskPricing.feeOf(1_200_000, 200), 24_000);
        assertEq(RiskPricing.feeOf(1, 200), 1);
        assertEq(RiskPricing.feeOf(0, 200), 0);
    }

    /// Pricing bands: monotone and bounded for any record and tier.
    function testFuzz_bandsAreBoundedAndConsistent(uint32 onTime, uint32 late, uint32 defaults, uint8 tier)
        public
        pure
    {
        RiskPricing.CreditRecord memory c = _rec(onTime, late, defaults);
        RiskPricing.Terms memory t = RiskPricing.terms(c, tier);
        assertLe(t.maxAdvanceBps, 8_000, "never above 80%");
        assertLe(t.sellerLimit, RiskPricing.MAX_LIMIT, "limit capped");
        if (defaults > 0 || tier == 0 || tier > 3) {
            assertEq(uint8(t.band), uint8(RiskPricing.Band.D));
            assertEq(t.maxAdvanceBps, 0);
        } else {
            assertGt(t.feeBps, 0, "a fee always applies");
            assertGe(t.sellerLimit, RiskPricing.BASE_LIMIT);
        }
        // a better buyer tier never gives worse terms
        if (tier >= 2 && tier <= 3) {
            RiskPricing.Terms memory better = RiskPricing.terms(c, tier - 1);
            assertGe(better.maxAdvanceBps, t.maxAdvanceBps);
            assertLe(better.feeBps, t.feeBps);
        }
    }

    function testFuzz_feeNeverBelowRate(uint128 advance, uint16 feeBps) public pure {
        feeBps = uint16(bound(feeBps, 0, 10_000));
        uint256 fee = RiskPricing.feeOf(advance, feeBps);
        assertGe(fee * 10_000, uint256(advance) * feeBps);
        assertLt(fee * 10_000, uint256(advance) * feeBps + 10_000);
    }
}
