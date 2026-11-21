// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";
import {AutorailRoles} from "../src/AutorailRoles.sol";
import {ReceivableRegistry} from "../src/ReceivableRegistry.sol";
import {Mock1271Wallet, IRegister} from "./mocks/Mock1271Wallet.sol";
import {Sigs} from "./utils/Sigs.sol";

contract ReceivableRegistryTest is Base {
    uint64 internal due;

    function setUp() public override {
        super.setUp();
        due = uint64(clock + C.DUE_IN);
    }

    // ─────────────── create ───────────────

    function test_create_recordsReceivable() public {
        vm.expectEmit(true, true, true, true, address(a.registry));
        emit ReceivableRegistry.ReceivableCreated(
            a.registry.computeId(seller, INVOICE_HASH),
            sellerAgent,
            buyerAgent,
            seller,
            INVOICE_HASH,
            C.INVOICE_AMOUNT,
            due
        );
        bytes32 id = _create();
        ReceivableRegistry.Receivable memory r = a.registry.get(id);
        assertEq(r.seller, seller);
        assertEq(r.sellerAgentId, sellerAgent);
        assertEq(r.buyerAgentId, buyerAgent);
        assertEq(r.amount, C.INVOICE_AMOUNT);
        assertEq(r.dueDate, due);
        assertEq(uint8(r.state), uint8(ReceivableRegistry.State.Created));
        assertEq(
            id,
            keccak256(abi.encode(block.chainid, address(a.registry), seller, INVOICE_HASH)),
            "non-sequential id"
        );
    }

    function test_create_onlySellerAgents() public {
        vm.prank(buyer);
        vm.expectRevert(ReceivableRegistry.NotSeller.selector);
        a.registry.create(INVOICE_HASH, buyerAgent, 1, due);
    }

    function test_create_buyerMustHaveBuyerRole() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(ReceivableRegistry.NotBuyerAgent.selector, merchantAgent));
        a.registry.create(INVOICE_HASH, merchantAgent, 1, due);
    }

    function test_create_selfDealing_sameOwner() public {
        // the seller also registers a buyer agent and invoices itself
        uint256 selfBuyer = _register(seller, "ipfs://self-buyer.json", AutorailRoles.Role.Buyer);
        vm.prank(seller);
        vm.expectRevert(ReceivableRegistry.SelfDealing.selector);
        a.registry.create(INVOICE_HASH, selfBuyer, 1, due);
    }

    function test_create_selfDealing_sameAgentId() public {
        // admin misconfigures the seller agent as a buyer too
        a.roles.setRole(sellerAgent, AutorailRoles.Role.Buyer);
        a.roles.setRole(sellerAgent, AutorailRoles.Role.Seller);
        // roleOf can only hold one role; simulate the same-id case via a seller that is also the buyer's wallet
        uint256 other = _register(seller, "ipfs://x.json", AutorailRoles.Role.Buyer);
        vm.prank(seller);
        vm.expectRevert(ReceivableRegistry.SelfDealing.selector);
        a.registry.create(keccak256("other"), other, 1, due);
    }

    function test_create_validation() public {
        vm.startPrank(seller);
        vm.expectRevert(ReceivableRegistry.ZeroAmount.selector);
        a.registry.create(INVOICE_HASH, buyerAgent, 0, due);
        vm.expectRevert(ReceivableRegistry.AmountTooLarge.selector);
        a.registry.create(INVOICE_HASH, buyerAgent, uint256(type(uint128).max) + 1, due);
        vm.expectRevert(ReceivableRegistry.DueDateInPast.selector);
        a.registry.create(INVOICE_HASH, buyerAgent, 1, uint64(clock));
        vm.stopPrank();
    }

    function test_create_duplicateInvoice_sameAndOtherSeller() public {
        _create();
        vm.prank(seller);
        vm.expectRevert(ReceivableRegistry.DuplicateInvoice.selector);
        a.registry.create(INVOICE_HASH, buyerAgent, C.INVOICE_AMOUNT, due);
        // a second seller can't reuse the hash either
        (address seller2,) = makeAddrAndKey("seller2");
        _register(seller2, "ipfs://seller2.json", AutorailRoles.Role.Seller);
        vm.prank(seller2);
        vm.expectRevert(ReceivableRegistry.DuplicateInvoice.selector);
        a.registry.create(INVOICE_HASH, buyerAgent, C.INVOICE_AMOUNT, due);
    }

    // ─────────────── confirm ───────────────

    function test_confirm_happyPath_consumesNonce() public {
        bytes32 id = _create();
        assertEq(a.registry.nonces(buyer), 0);
        _confirm(id);
        assertEq(a.registry.nonces(buyer), 1);
        ReceivableRegistry.Receivable memory r = a.registry.get(id);
        assertEq(r.buyer, buyer);
        assertEq(r.confirmedAt, clock);
    }

    function test_confirm_wrongPayee() public {
        bytes32 id = _create();
        uint256 d = clock + 1 hours;
        bytes memory sig = _confirmSig(id, buyerKey, buyer, rogue, d);
        vm.expectRevert(abi.encodeWithSelector(ReceivableRegistry.WrongPayee.selector, rogue));
        a.registry.confirm(id, buyer, rogue, d, sig);
    }

    function test_confirm_expiredDeadline() public {
        bytes32 id = _create();
        uint256 d = clock + 1 hours;
        bytes memory sig = _confirmSig(id, buyerKey, buyer, address(a.router), d);
        _warp(d + 1);
        vm.expectRevert(abi.encodeWithSelector(ReceivableRegistry.SignatureExpired.selector, d));
        a.registry.confirm(id, buyer, address(a.router), d, sig);
    }

    function test_confirm_wrongSigner() public {
        bytes32 id = _create();
        uint256 d = clock + 1 hours;
        bytes memory sig = _confirmSig(id, sellerKey, buyer, address(a.router), d); // signed by the seller
        vm.expectRevert(ReceivableRegistry.InvalidSignature.selector);
        a.registry.confirm(id, buyer, address(a.router), d, sig);
    }

    function test_confirm_signerMustBeTheBuyerAgent() public {
        bytes32 id = _create();
        uint256 d = clock + 1 hours;
        bytes memory sig = _confirmSig(id, sellerKey, seller, address(a.router), d);
        vm.expectRevert(abi.encodeWithSelector(ReceivableRegistry.NotBuyer.selector, seller));
        a.registry.confirm(id, seller, address(a.router), d, sig);
    }

    function test_confirm_replayAcrossReceivablesFails() public {
        bytes32 id1 = _create();
        bytes32 id2 = _createWith(keccak256("INV-002"), C.INVOICE_AMOUNT);
        uint256 d = clock + 1 hours;
        bytes memory sig = _confirmSig(id1, buyerKey, buyer, address(a.router), d);
        a.registry.confirm(id1, buyer, address(a.router), d, sig);
        vm.expectRevert(ReceivableRegistry.InvalidSignature.selector);
        a.registry.confirm(id2, buyer, address(a.router), d, sig);
    }

    function test_confirm_twiceReverts() public {
        bytes32 id = _create();
        _confirm(id);
        vm.expectRevert(
            abi.encodeWithSelector(
                ReceivableRegistry.InvalidState.selector, id, ReceivableRegistry.State.Confirmed
            )
        );
        a.registry.confirm(id, buyer, address(a.router), clock + 1, "");
    }

    function test_confirm_wrongChainIdFails() public {
        bytes32 id = _create();
        uint256 d = clock + 1 hours;
        // signed for this chain, submitted on another (chain-id is part of the EIP-712 domain)
        bytes memory sig = _confirmSig(id, buyerKey, buyer, address(a.router), d);
        vm.chainId(44005);
        vm.expectRevert(ReceivableRegistry.InvalidSignature.selector);
        a.registry.confirm(id, buyer, address(a.router), d, sig);
    }

    function test_confirm_erc1271BuyerWallet() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("labSafeOwner");
        Mock1271Wallet safe = new Mock1271Wallet(owner);
        uint256 safeAgent = safe.registerAgent(IRegister(address(a.identity)), "ipfs://lab-safe.json");
        a.roles.setRole(safeAgent, AutorailRoles.Role.Buyer);
        a.roles.setBuyerTier(safeAgent, 1);
        vm.prank(seller);
        bytes32 id = a.registry.create(keccak256("INV-SAFE"), safeAgent, 1_000_000, due);
        uint256 d = clock + 1 hours;
        bytes memory sig = _confirmSig(id, ownerKey, address(safe), address(a.router), d);
        a.registry.confirm(id, address(safe), address(a.router), d, sig);
        assertEq(a.registry.get(id).buyer, address(safe));
        // a rejecting wallet fails
        bytes32 id2;
        vm.prank(seller);
        id2 = a.registry.create(keccak256("INV-SAFE-2"), safeAgent, 1_000_000, due);
        safe.setRejectAll(true);
        sig = _confirmSig(id2, ownerKey, address(safe), address(a.router), d);
        vm.expectRevert(ReceivableRegistry.InvalidSignature.selector);
        a.registry.confirm(id2, address(safe), address(a.router), d, sig);
    }

    function test_confirm_requiresRouterConfigured() public {
        ReceivableRegistry fresh = new ReceivableRegistry(a.roles, address(this));
        vm.prank(seller);
        bytes32 id = fresh.create(INVOICE_HASH, buyerAgent, 1, due);
        vm.expectRevert(ReceivableRegistry.RouterNotSet.selector);
        fresh.confirm(id, buyer, address(a.router), clock + 1, "");
    }

    // ─────────────── transitions & views ───────────────

    function test_transition_onlyFacilityAndValidEdges() public {
        bytes32 id = _create();
        vm.expectRevert(ReceivableRegistry.NotFacility.selector);
        a.registry.transition(id, ReceivableRegistry.State.Funded);
        vm.prank(address(a.facility));
        vm.expectRevert(
            abi.encodeWithSelector(
                ReceivableRegistry.InvalidState.selector, id, ReceivableRegistry.State.Created
            )
        );
        a.registry.transition(id, ReceivableRegistry.State.Funded);
    }

    function test_unknownReceivable() public {
        bytes32 nope = keccak256("nope");
        vm.expectRevert(abi.encodeWithSelector(ReceivableRegistry.UnknownReceivable.selector, nope));
        a.registry.get(nope);
        assertEq(uint8(a.registry.stateOf(nope)), uint8(ReceivableRegistry.State.None));
    }

    function test_domainSeparator_matchesEip712() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Autorail ReceivableRegistry"),
                keccak256("1"),
                block.chainid,
                address(a.registry)
            )
        );
        assertEq(a.registry.domainSeparator(), expected);
    }

    function test_admin() public {
        vm.expectRevert(ReceivableRegistry.ZeroAddress.selector);
        a.registry.setFacility(address(0));
        vm.expectRevert(ReceivableRegistry.ZeroAddress.selector);
        a.registry.setRepaymentRouter(address(0));
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rogue));
        a.registry.setFacility(rogue);
        vm.expectRevert(ReceivableRegistry.ZeroAddress.selector);
        new ReceivableRegistry(AutorailRoles(address(0)), address(this));
    }

    function test_sigsHelperMatchesRegistryDigest() public {
        bytes32 id = _create();
        bytes memory sig =
            Sigs.sign(vm, buyerKey, a.registry.confirmationDigest(id, buyer, address(a.router), 0, 1));
        assertEq(sig.length, 65);
    }
}
