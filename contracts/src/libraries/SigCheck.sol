// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @title SigCheck
/// @notice ECDSA-or-ERC-1271 signature check.
/// @dev Replaces OpenZeppelin 5.4 `SignatureChecker`, which imports `Bytes.sol` (inline `mcopy`, a Cancun
///      opcode that doesn't exist on Aevum's Shanghai EVM). Same semantics as `isValidSignatureNow`.
library SigCheck {
    function isValid(address signer, bytes32 digest, bytes memory signature) internal view returns (bool) {
        if (signer == address(0)) return false;
        if (signer.code.length == 0) {
            (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
            return err == ECDSA.RecoverError.NoError && recovered == signer;
        }
        (bool ok, bytes memory res) =
            signer.staticcall(abi.encodeCall(IERC1271.isValidSignature, (digest, signature)));
        return ok && res.length >= 32 && abi.decode(res, (bytes4)) == IERC1271.isValidSignature.selector;
    }
}
