// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "../Base.t.sol";
import {DemoConfig as C} from "../../script/DemoConfig.sol";
import {ReceivableRegistry} from "../../src/ReceivableRegistry.sol";
import {JobWallet} from "../../src/JobWallet.sol";
import {MockTUSD8} from "../mocks/MockTUSD8.sol";
import {Sigs} from "../utils/Sigs.sol";

/// @notice The Autorail system against the REAL tUSD8 (FiatToken v2.2) on a fork of Aevum. No funds needed:
///         `deal` writes balances into the fork only.
///   make test-fork          (forge test --match-path 'test/fork/*' --fork-url https://rpc-test.qday.info)
///   or against `make fork`  (chain 440050)
contract RealTusd8ForkTest is Base {
    address internal constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function setUp() public override {
        if (block.chainid != 44005 && block.chainid != 440050) {
            vm.skip(true);
            return;
        }
        super.setUp();
    }

    function _newToken() internal pure override returns (MockTUSD8) {
        return MockTUSD8(TUSD8); // only the real token's functions are called (no mint)
    }

    function _mint(address to, uint256 amount) internal override {
        deal(TUSD8, to, token.balanceOf(to) + amount);
    }

    function test_fork_realDomainSeparator() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("tUSD8"),
                keccak256("2"),
                block.chainid,
                TUSD8
            )
        );
        assertEq(token.DOMAIN_SEPARATOR(), expected);
        assertEq(token.decimals(), 6);
    }

    function test_fork_permitDeposit_realToken() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = Sigs.signPermit(
            vm,
            lenderKey,
            token.DOMAIN_SEPARATOR(),
            lender,
            address(a.vault),
            C.LENDER_DEPOSIT,
            token.nonces(lender),
            deadline
        );
        vm.prank(lender);
        uint256 shares = a.vault.depositWithPermit(C.LENDER_DEPOSIT, lender, deadline, v, r, s);
        assertEq(a.vault.previewRedeem(shares), C.LENDER_DEPOSIT);
        assertEq(token.balanceOf(lender), 0);
    }

    function test_fork_fullFlow_realReceiveWithAuthorization() public {
        (bytes32 id, JobWallet jw) = _funded();
        _grant(jw);
        vm.startPrank(payout);
        jw.pay(annotatorA, C.PAY_A, "a");
        jw.pay(annotatorB, C.PAY_B, "b");
        jw.pay(merchant, C.PAY_GPU, keccak256("x402:req-1"));
        vm.stopPrank();
        uint256 vaultBefore = token.balanceOf(address(a.vault));
        uint256 sellerBefore = token.balanceOf(seller);
        _repay(id); // real tUSD8 receiveWithAuthorization with the receivable-bound nonce
        assertEq(uint8(_state(id)), uint8(ReceivableRegistry.State.Repaid));
        assertEq(token.balanceOf(address(a.vault)) - vaultBefore, C.EXPECT_VAULT_REPAID);
        assertEq(token.balanceOf(seller) - sellerBefore, C.EXPECT_SELLER_REMAINDER + C.EXPECT_SWEPT);
        assertTrue(
            token.authorizationState(buyer, a.router.authorizationNonce(id)), "nonce consumed on tUSD8"
        );
    }
}
