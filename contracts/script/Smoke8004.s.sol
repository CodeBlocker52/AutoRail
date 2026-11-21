// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistryUpgradeable} from "../src/erc8004/IdentityRegistryUpgradeable.sol";
import {ReputationRegistryUpgradeable} from "../src/erc8004/ReputationRegistryUpgradeable.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice ERC-8004 runtime smoke test on the live registries: every function Autorail uses, executed for real.
///         A separate "smoke" agent (owned by Annotator A) keeps the demo seller's reputation untouched; the
///         merchant gives the feedback (self-feedback is forbidden by the spec).
///   forge script script/Smoke8004.s.sol --rpc-url aevum --legacy --slow --broadcast
contract Smoke8004 is Script {
    function run() external {
        string memory dep =
            vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".addresses.json"));
        IdentityRegistryUpgradeable identity =
            IdentityRegistryUpgradeable(vm.parseJsonAddress(dep, ".IdentityRegistry"));
        ReputationRegistryUpgradeable reputation =
            ReputationRegistryUpgradeable(vm.parseJsonAddress(dep, ".ReputationRegistry"));
        uint256 ownerKey = Keys.load("ANNOTATOR_A_PRIVATE_KEY");
        uint256 clientKey = Keys.load("MERCHANT_PRIVATE_KEY");
        address owner = vm.addr(ownerKey);
        address client = vm.addr(clientKey);

        // writes: register + setAgentURI (Identity), giveFeedback (Reputation)
        vm.startBroadcast(ownerKey);
        uint256 id = identity.register("data:application/json,{\"name\":\"autorail-erc8004-smoke\"}");
        identity.setAgentURI(
            id, "data:application/json,{\"name\":\"autorail-erc8004-smoke\",\"note\":\"runtime smoke test\"}"
        );
        vm.stopBroadcast();
        vm.startBroadcast(clientKey);
        reputation.giveFeedback(id, 77, 0, "smoke", "erc8004-runtime", "", "", keccak256("autorail-smoke"));
        vm.stopBroadcast();

        // reads: ownerOf, tokenURI, isAuthorizedOrOwner, getAgentWallet, getSummary
        require(identity.ownerOf(id) == owner, "ownerOf");
        string memory uri = identity.tokenURI(id);
        require(bytes(uri).length > 0, "tokenURI");
        require(identity.isAuthorizedOrOwner(owner, id) && !identity.isAuthorizedOrOwner(client, id), "auth");
        require(identity.getAgentWallet(id) == owner, "agentWallet");
        address[] memory clients = new address[](1);
        clients[0] = client;
        (uint64 count, int128 value, uint8 decimals) = reputation.getSummary(id, clients, "smoke", "");
        require(count == 1 && value == 77 && decimals == 0, "getSummary");

        console.log("smoke agent id", id);
        console.log("ownerOf", identity.ownerOf(id));
        console.log("tokenURI", uri);
        console.log("getSummary count/value", count, uint256(uint128(value)));
    }
}
