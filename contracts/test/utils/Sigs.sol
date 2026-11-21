// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @dev Builds the EIP-712 signatures a wallet would produce. Based on Aevum Starter Kit's test/Signing.sol (MIT).
library Sigs {
    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    struct Auth {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }

    function digest(bytes32 domainSeparator, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function signReceive(Vm vm, uint256 pk, bytes32 domainSeparator, Auth memory a)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 h = keccak256(
            abi.encode(RECEIVE_TYPEHASH, a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce)
        );
        return vm.sign(pk, digest(domainSeparator, h));
    }

    function signPermit(
        Vm vm,
        uint256 pk,
        bytes32 domainSeparator,
        address owner,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 h = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline));
        return vm.sign(pk, digest(domainSeparator, h));
    }

    function sign(Vm vm, uint256 pk, bytes32 hash) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, hash);
        return abi.encodePacked(r, s, v);
    }
}
