// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Tiny contract that proves Shanghai bytecode runs on Aevum: PUSH0 (emitted by solc for
///         evm_version=shanghai), ecrecover precompile and CHAINID.
contract ShanghaiProbe {
    function probe(bytes32 digest, uint8 v, bytes32 r, bytes32 s)
        external
        view
        returns (uint256 chainId, address signer, uint256 zero)
    {
        assembly {
            zero := 0 // PUSH0
        }
        chainId = block.chainid;
        signer = ecrecover(digest, v, r, s);
    }
}

/// forge script script/Probe.s.sol --rpc-url aevum --legacy --broadcast
contract Probe is Script {
    function run() external returns (ShanghaiProbe p) {
        vm.startBroadcast(Keys.load("DEPLOYER_PRIVATE_KEY"));
        p = new ShanghaiProbe();
        vm.stopBroadcast();
        console.log("ShanghaiProbe", address(p));
    }
}
