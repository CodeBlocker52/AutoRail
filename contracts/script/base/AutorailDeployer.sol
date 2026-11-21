// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IdentityRegistryUpgradeable} from "../../src/erc8004/IdentityRegistryUpgradeable.sol";
import {ReputationRegistryUpgradeable} from "../../src/erc8004/ReputationRegistryUpgradeable.sol";
import {ERC8004Bootstrap} from "../../src/erc8004/ERC8004Bootstrap.sol";
import {AutorailERC1967Proxy} from "../../src/erc8004/ERC1967ProxyImport.sol";
import {IERC8004Identity, IERC8004Reputation} from "../../src/interfaces/IERC8004.sol";
import {AutorailRoles} from "../../src/AutorailRoles.sol";
import {AutorailVault} from "../../src/AutorailVault.sol";
import {ReceivableRegistry} from "../../src/ReceivableRegistry.sol";
import {JobWallet} from "../../src/JobWallet.sol";
import {JobWalletFactory} from "../../src/JobWalletFactory.sol";
import {CreditFacility} from "../../src/CreditFacility.sol";
import {RepaymentRouter} from "../../src/RepaymentRouter.sol";

/// @notice Deploys and wires the whole Autorail system. Shared by Deploy.s.sol and the tests, so the tests
///         exercise exactly what goes on chain. `admin` must be the caller (it performs the wiring).
abstract contract AutorailDeployer {
    struct Autorail {
        IdentityRegistryUpgradeable identity;
        ReputationRegistryUpgradeable reputation;
        AutorailRoles roles;
        AutorailVault vault;
        ReceivableRegistry registry;
        JobWallet jobWalletImpl;
        JobWalletFactory factory;
        CreditFacility facility;
        RepaymentRouter router;
        address bootstrap;
        address identityImpl;
        address reputationImpl;
    }

    function _deployAutorail(IERC20 token, address admin) internal returns (Autorail memory a) {
        // ERC-8004: official implementations behind ERC1967 proxies, bootstrapped so `admin` owns them.
        ERC8004Bootstrap boot = new ERC8004Bootstrap();
        a.bootstrap = address(boot);
        a.identityImpl = address(new IdentityRegistryUpgradeable());
        a.reputationImpl = address(new ReputationRegistryUpgradeable());
        bytes memory bootInit = abi.encodeCall(ERC8004Bootstrap.initialize, (admin));

        address idProxy = address(new AutorailERC1967Proxy(address(boot), bootInit));
        UUPSUpgradeable(idProxy)
            .upgradeToAndCall(a.identityImpl, abi.encodeCall(IdentityRegistryUpgradeable.initialize, ()));
        a.identity = IdentityRegistryUpgradeable(idProxy);

        address repProxy = address(new AutorailERC1967Proxy(address(boot), bootInit));
        UUPSUpgradeable(repProxy)
            .upgradeToAndCall(
                a.reputationImpl, abi.encodeCall(ReputationRegistryUpgradeable.initialize, (idProxy))
            );
        a.reputation = ReputationRegistryUpgradeable(repProxy);

        // Autorail core
        a.roles = new AutorailRoles(IERC8004Identity(idProxy), admin);
        a.vault = new AutorailVault(token, admin);
        a.registry = new ReceivableRegistry(a.roles, admin);
        a.jobWalletImpl = new JobWallet();
        a.factory = new JobWalletFactory(address(a.jobWalletImpl), token, admin);
        a.facility =
            new CreditFacility(a.registry, a.vault, a.factory, a.roles, IERC8004Reputation(repProxy), admin);
        a.router =
            new RepaymentRouter(token, a.registry, a.facility, a.vault, IERC8004Reputation(repProxy), admin);

        // Wiring
        a.vault.setFacility(address(a.facility));
        a.vault.setRouter(address(a.router));
        a.registry.setFacility(address(a.facility));
        a.registry.setRepaymentRouter(address(a.router));
        a.factory.setWiring(address(a.facility), address(a.router));
        a.facility.setRouter(address(a.router));
    }
}
