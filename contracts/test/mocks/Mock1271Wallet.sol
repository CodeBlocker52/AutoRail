// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IRegister {
    function register(string memory agentURI) external returns (uint256);
}

/// @notice Smart-contract wallet (ERC-1271) controlled by one EOA. Can own an ERC-8004 agent. TESTS ONLY.
contract Mock1271Wallet is IERC1271, IERC721Receiver {
    address public immutable signer;
    bool public rejectAll;

    constructor(address signer_) {
        signer = signer_;
    }

    function setRejectAll(bool v) external {
        rejectAll = v;
    }

    function registerAgent(IRegister identity, string memory uri) external returns (uint256) {
        return identity.register(uri);
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        if (rejectAll) return 0xffffffff;
        (address rec, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        return
            err == ECDSA.RecoverError.NoError && rec == signer
                ? IERC1271.isValidSignature.selector
                : bytes4(0);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
