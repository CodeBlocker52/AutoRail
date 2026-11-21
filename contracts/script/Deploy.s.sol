// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AutorailDeployer} from "./base/AutorailDeployer.sol";
import {DemoConfig as C} from "./DemoConfig.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Deploys the full Autorail system against the REAL tUSD8 (Aevum 44005 or `make fork` 440050) and
///         writes deployments/<chainId>.addresses.json (scripts/write-deployment.mjs adds tx hashes etc.).
///   make deploy-fork | make deploy-aevum [ACCOUNT=<keystore>]
contract Deploy is Script, AutorailDeployer {
    address internal constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function run() external returns (Autorail memory a) {
        require(
            block.chainid == 44005 || block.chainid == 440050,
            "Deploy only to Aevum (44005) or make fork (440050)"
        );
        require(TUSD8.code.length > 0, "tUSD8 not found: wrong RPC?");

        bool useAccount = bytes(vm.envOr("ACCOUNT", string(""))).length > 0;
        if (useAccount) vm.startBroadcast();
        else vm.startBroadcast(Keys.load("DEPLOYER_PRIVATE_KEY"));
        (, address deployer,) = vm.readCallers();

        a = _deployAutorail(IERC20(TUSD8), deployer);
        a.facility.setPeriods(C.GRACE_PERIOD, C.DEFAULT_PERIOD);

        // Dead-shares seed against the ERC-4626 inflation attack.
        IERC20(TUSD8).approve(address(a.vault), C.VAULT_SEED);
        a.vault.deposit(C.VAULT_SEED, C.DEAD);

        // Optional hand-over to a separate admin (Ownable2Step: the admin must call acceptOwnership).
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        if (admin != deployer) {
            a.roles.transferOwnership(admin);
            a.vault.transferOwnership(admin);
            a.registry.transferOwnership(admin);
            a.factory.transferOwnership(admin);
            a.facility.transferOwnership(admin);
            a.router.transferOwnership(admin);
        }
        vm.stopBroadcast();

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "tUSD8", TUSD8);
        vm.serializeAddress(k, "IdentityRegistry", address(a.identity));
        vm.serializeAddress(k, "IdentityRegistryImpl", a.identityImpl);
        vm.serializeAddress(k, "ReputationRegistry", address(a.reputation));
        vm.serializeAddress(k, "ReputationRegistryImpl", a.reputationImpl);
        vm.serializeAddress(k, "ERC8004Bootstrap", a.bootstrap);
        vm.serializeAddress(k, "AutorailRoles", address(a.roles));
        vm.serializeAddress(k, "AutorailVault", address(a.vault));
        vm.serializeAddress(k, "ReceivableRegistry", address(a.registry));
        vm.serializeAddress(k, "JobWalletImplementation", address(a.jobWalletImpl));
        vm.serializeAddress(k, "JobWalletFactory", address(a.factory));
        vm.serializeAddress(k, "CreditFacility", address(a.facility));
        string memory json = vm.serializeAddress(k, "RepaymentRouter", address(a.router));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".addresses.json");
        vm.writeJson(json, path);
        console.log("Wrote", path);
        console.log("RepaymentRouter", address(a.router));
    }
}
