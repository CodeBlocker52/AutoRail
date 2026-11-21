// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockTUSD8} from "./MockTUSD8.sol";

/// @notice A malicious token: on its next transfer it calls `target` with `data` (re-entering whatever is
///         transferring), and bubbles up any revert. Models ERC-777-style hooks or a hostile token. TESTS ONLY.
contract HookToken is MockTUSD8 {
    address public target;
    bytes public data;
    bool public armed;

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed) {
            armed = false; // fire once
            (bool ok, bytes memory ret) = target.call(data);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}
