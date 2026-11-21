// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @notice Reads private keys from env vars that may or may not carry a 0x prefix. Never logs them.
library Keys {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function load(string memory name) internal view returns (uint256) {
        string memory raw = vm.envString(name);
        bytes memory b = bytes(raw);
        if (b.length >= 2 && b[0] == "0" && (b[1] == "x" || b[1] == "X")) return vm.parseUint(raw);
        return vm.parseUint(string.concat("0x", raw));
    }

    function addr(string memory name) internal view returns (address) {
        return vm.addr(load(name));
    }
}
