// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title ERC8004Bootstrap
/// @notice Version-1 placeholder implementation for the ERC-8004 registry proxies.
/// @dev The official registries initialise through `reinitializer(2) onlyOwner`, so a proxy needs an owner
///      first. Upstream's `MinimalUUPS` hard-codes the ERC-8004 team's owner, so we use this stub instead:
///      `ERC1967Proxy(bootstrap, initialize(admin))` → `upgradeToAndCall(officialImpl, initialize(...))`.
///      Slot 0 is reserved to match the official layout (ReputationRegistry keeps `_identityRegistry` there).
contract ERC8004Bootstrap is OwnableUpgradeable, UUPSUpgradeable {
    address private _reservedSlot0;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Sets the proxy owner (the account allowed to upgrade to the real implementation).
    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
