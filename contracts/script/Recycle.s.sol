// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Sweeps demo funds back to the deployer: the lender redeems what the vault allows, then every account
///         returns its tUSD8 and its tQDAY minus a gas reserve.
///   make recycle-fork | make recycle-aevum
contract Recycle is Script {
    address internal constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 internal constant GAS_RESERVE = 0.001 ether;

    function run() external {
        address deployer = Keys.addr("DEPLOYER_PRIVATE_KEY");
        IERC20 t = IERC20(TUSD8);
        string memory deployment =
            vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".addresses.json"));
        IERC4626 vault = IERC4626(vm.parseJsonAddress(deployment, ".AutorailVault"));

        uint256 lenderKey = Keys.load("LENDER_PRIVATE_KEY");
        address lender = vm.addr(lenderKey);
        uint256 shares = vault.maxRedeem(lender);
        if (shares > 0) {
            vm.startBroadcast(lenderKey);
            vault.redeem(shares, lender, lender);
            vm.stopBroadcast();
        }

        string[10] memory names = [
            "UNDERWRITER_PRIVATE_KEY",
            "RELAYER_PRIVATE_KEY",
            "LENDER_PRIVATE_KEY",
            "SELLER_PRIVATE_KEY",
            "BUYER_PRIVATE_KEY",
            "PAYOUT_SESSION_PRIVATE_KEY",
            "MERCHANT_PRIVATE_KEY",
            "ANNOTATOR_A_PRIVATE_KEY",
            "ANNOTATOR_B_PRIVATE_KEY",
            "ROGUE_PRIVATE_KEY"
        ];
        for (uint256 i; i < names.length; i++) {
            uint256 key = Keys.load(names[i]);
            address who = vm.addr(key);
            uint256 usd = t.balanceOf(who);
            uint256 native = who.balance;
            if (usd == 0 && native <= GAS_RESERVE) continue;
            vm.startBroadcast(key);
            if (usd > 0) t.transfer(deployer, usd);
            if (native > GAS_RESERVE) payable(deployer).transfer(native - GAS_RESERVE);
            vm.stopBroadcast();
        }
        console.log("Recycled. Deployer tUSD8:", t.balanceOf(deployer));
    }
}
