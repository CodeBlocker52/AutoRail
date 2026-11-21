// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {SigCheck} from "../src/libraries/SigCheck.sol";
import {Mock1271Wallet} from "./mocks/Mock1271Wallet.sol";
import {Sigs} from "./utils/Sigs.sol";

contract SigCheckHarness {
    function isValid(address signer, bytes32 digest, bytes memory sig) external view returns (bool) {
        return SigCheck.isValid(signer, digest, sig);
    }
}

contract RevertingWallet {
    function isValidSignature(bytes32, bytes memory) external pure returns (bytes4) {
        revert("nope");
    }
}

contract SigCheckTest is Test {
    SigCheckHarness h = new SigCheckHarness();
    bytes32 constant D = keccak256("digest");

    function test_eoa() public {
        (address who, uint256 key) = makeAddrAndKey("who");
        bytes memory sig = Sigs.sign(vm, key, D);
        assertTrue(h.isValid(who, D, sig));
        assertFalse(h.isValid(makeAddr("other"), D, sig));
        assertFalse(h.isValid(address(0), D, sig));
        assertFalse(h.isValid(who, D, hex"1234"), "malformed signature");
    }

    function test_erc1271() public {
        (address owner, uint256 key) = makeAddrAndKey("owner");
        Mock1271Wallet w = new Mock1271Wallet(owner);
        bytes memory sig = Sigs.sign(vm, key, D);
        assertTrue(h.isValid(address(w), D, sig));
        w.setRejectAll(true);
        assertFalse(h.isValid(address(w), D, sig));
        assertFalse(h.isValid(address(new RevertingWallet()), D, sig), "reverting wallet");
        assertFalse(h.isValid(address(h), D, sig), "contract without ERC-1271");
    }
}
