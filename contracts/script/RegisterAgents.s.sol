// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IdentityRegistryUpgradeable} from "../src/erc8004/IdentityRegistryUpgradeable.sol";
import {AutorailRoles} from "../src/AutorailRoles.sol";
import {Keys} from "./utils/Keys.sol";

/// @notice Each of the 5 demo agents registers on ERC-8004 from its own key, with a fully onchain
///         `data:application/json;base64,…` agentURI (registration file v1); then the admin assigns roles and
///         the buyer tier. Idempotent: agents that already hold their role are skipped.
///   make register-agents-fork | make register-agents-aevum
contract RegisterAgents is Script {
    struct AgentSpec {
        string slug;
        string keyVar;
        AutorailRoles.Role role;
    }

    function run() external {
        string memory deployment =
            vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".addresses.json"));
        IdentityRegistryUpgradeable identity =
            IdentityRegistryUpgradeable(vm.parseJsonAddress(deployment, ".IdentityRegistry"));
        AutorailRoles roles = AutorailRoles(vm.parseJsonAddress(deployment, ".AutorailRoles"));

        AgentSpec[5] memory specs = [
            AgentSpec("lumen-data", "SELLER_PRIVATE_KEY", AutorailRoles.Role.Seller),
            AgentSpec("frontier-lab", "BUYER_PRIVATE_KEY", AutorailRoles.Role.Buyer),
            AgentSpec("underwriter", "UNDERWRITER_PRIVATE_KEY", AutorailRoles.Role.Underwriter),
            AgentSpec("payout", "PAYOUT_SESSION_PRIVATE_KEY", AutorailRoles.Role.Payout),
            AgentSpec("kestrel-gpu", "MERCHANT_PRIVATE_KEY", AutorailRoles.Role.Merchant)
        ];
        uint256[5] memory ids;
        string memory out = "agents";
        string memory json;

        for (uint256 i; i < specs.length; i++) {
            uint256 key = Keys.load(specs[i].keyVar);
            address who = vm.addr(key);
            (bool has, uint256 existing) = roles.isAgent(who, specs[i].role);
            if (has) {
                ids[i] = existing;
                console.log("already registered:", specs[i].slug, existing);
            } else {
                vm.startBroadcast(key);
                uint256 id = identity.register();
                string memory file = _render(specs[i].slug, id, address(identity));
                identity.setAgentURI(
                    id, string.concat("data:application/json;base64,", Base64.encode(bytes(file)))
                );
                vm.stopBroadcast();
                ids[i] = id;
                vm.writeFile(
                    string.concat(
                        "deployments/agents/", vm.toString(block.chainid), "-", specs[i].slug, ".json"
                    ),
                    file
                );
                console.log("registered:", specs[i].slug, id);
            }
            json = vm.serializeUint(out, specs[i].slug, ids[i]);
        }

        // Admin assigns roles (skipped where already correct) and the buyer tier.
        bool useAccount = bytes(vm.envOr("ACCOUNT", string(""))).length > 0;
        if (useAccount) vm.startBroadcast();
        else vm.startBroadcast(Keys.load("DEPLOYER_PRIVATE_KEY"));
        for (uint256 i; i < specs.length; i++) {
            if (roles.roleOf(ids[i]) != specs[i].role || !_hasPrimary(roles, ids[i], specs[i])) {
                roles.setRole(ids[i], specs[i].role);
            }
        }
        if (roles.buyerTier(ids[1]) != 1) roles.setBuyerTier(ids[1], 1);
        vm.stopBroadcast();

        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".agents.json"));
    }

    function _hasPrimary(AutorailRoles roles, uint256 id, AgentSpec memory s) internal view returns (bool) {
        (bool ok, uint256 got) = roles.isAgent(vm.addr(Keys.load(s.keyVar)), s.role);
        return ok && got == id;
    }

    function _render(string memory slug, uint256 id, address identity)
        internal
        view
        returns (string memory s)
    {
        s = vm.readFile(string.concat("deployments/agents/templates/", slug, ".json"));
        s = vm.replace(s, "{AGENT_ID}", vm.toString(id));
        s = vm.replace(s, "{CHAIN_ID}", vm.toString(block.chainid));
        s = vm.replace(s, "{IDENTITY_REGISTRY}", vm.toString(identity));
        s = vm.replace(s, "\n", "");
    }
}
