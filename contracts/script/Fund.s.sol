// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoConfig as C} from "./DemoConfig.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Idempotent top-ups from the deployer: tQDAY for gas to every active account, and the demo tUSD8
///         budget to the lender (deposit) and the buyer (invoice). Only sends the shortfall.
///   make fund-fork | make fund-aevum
contract Fund is Script {
    address internal constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 internal constant GAS_TOPUP = 0.3 ether; // tQDAY (18 decimals)
    uint256 internal constant SMALL_TOPUP = 0.05 ether;

    function run() external {
        uint256 deployerKey = Keys.load("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        IERC20 t = IERC20(TUSD8);

        string[7] memory active = [
            "UNDERWRITER_PRIVATE_KEY",
            "RELAYER_PRIVATE_KEY",
            "LENDER_PRIVATE_KEY",
            "SELLER_PRIVATE_KEY",
            "BUYER_PRIVATE_KEY",
            "PAYOUT_SESSION_PRIVATE_KEY",
            "MERCHANT_PRIVATE_KEY"
        ];
        address lender = Keys.addr("LENDER_PRIVATE_KEY");
        address buyer = Keys.addr("BUYER_PRIVATE_KEY");
        uint256 needUsd =
            _short(t.balanceOf(lender), C.LENDER_DEPOSIT) + _short(t.balanceOf(buyer), C.INVOICE_AMOUNT);
        require(t.balanceOf(deployer) >= needUsd, "deployer lacks tUSD8 for the demo budget");

        vm.startBroadcast(deployerKey);
        for (uint256 i; i < active.length; i++) {
            address who = Keys.addr(active[i]);
            uint256 gap = _short(who.balance, GAS_TOPUP);
            if (gap > 0) payable(who).transfer(gap);
        }
        string[2] memory small = ["ANNOTATOR_A_PRIVATE_KEY", "ANNOTATOR_B_PRIVATE_KEY"];
        for (uint256 i; i < small.length; i++) {
            address who = Keys.addr(small[i]);
            uint256 gap = _short(who.balance, SMALL_TOPUP);
            if (gap > 0) payable(who).transfer(gap);
        }
        uint256 g1 = _short(t.balanceOf(lender), C.LENDER_DEPOSIT);
        if (g1 > 0) t.transfer(lender, g1);
        uint256 g2 = _short(t.balanceOf(buyer), C.INVOICE_AMOUNT);
        if (g2 > 0) t.transfer(buyer, g2);
        vm.stopBroadcast();
        console.log("Funded. Deployer tUSD8 left:", t.balanceOf(deployer));
    }

    function _short(uint256 have, uint256 want) internal pure returns (uint256) {
        return have >= want ? 0 : want - have;
    }
}
