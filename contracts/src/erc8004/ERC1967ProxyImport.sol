// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Re-export so scripts and tests can deploy OpenZeppelin's ERC1967Proxy (same as upstream ERC-8004 repo).
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract AutorailERC1967Proxy is ERC1967Proxy {
    constructor(address implementation, bytes memory data) ERC1967Proxy(implementation, data) {}
}
