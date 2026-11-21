// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AutorailDeployer} from "../script/base/AutorailDeployer.sol";
import {DemoConfig as C} from "../script/DemoConfig.sol";
import {AutorailRoles} from "../src/AutorailRoles.sol";
import {ReceivableRegistry} from "../src/ReceivableRegistry.sol";
import {CreditFacility} from "../src/CreditFacility.sol";
import {JobWallet} from "../src/JobWallet.sol";
import {MockTUSD8} from "./mocks/MockTUSD8.sol";
import {Sigs} from "./utils/Sigs.sol";

/// @notice Full Autorail system on a MockTUSD8, with the five demo agents registered on ERC-8004.
abstract contract Base is Test, AutorailDeployer {
    MockTUSD8 internal token;
    Autorail internal a;

    address internal seller;
    uint256 internal sellerKey;
    address internal buyer;
    uint256 internal buyerKey;
    address internal underwriter;
    uint256 internal underwriterKey;
    address internal payout;
    uint256 internal payoutKey;
    address internal merchant;
    uint256 internal merchantKey;
    address internal lender;
    uint256 internal lenderKey;
    address internal relayer = makeAddr("relayer");
    address internal annotatorA = makeAddr("annotatorA");
    address internal annotatorB = makeAddr("annotatorB");
    address internal rogue = makeAddr("rogue0xBAD");

    uint256 internal sellerAgent;
    uint256 internal buyerAgent;
    uint256 internal underwriterAgent;
    uint256 internal payoutAgent;
    uint256 internal merchantAgent;

    /// @dev Test clock kept in STORAGE. Never derive a value from `block.timestamp` and use it across a
    ///      `vm.warp`: TIMESTAMP is constant within a transaction, so the (via-IR) optimizer may legally
    ///      re-materialize `TIMESTAMP + x` at the use site, after the warp. A storage read can't be swapped.
    uint256 internal constant T0 = 1_790_000_000;
    uint256 internal clock;

    function _warp(uint256 t) internal {
        clock = t;
        vm.warp(t);
    }

    bytes32 internal constant INVOICE_HASH = keccak256("INV-001 Frontier Lab RLHF preference batch 7");
    uint256 internal offerNonce;

    function setUp() public virtual {
        _warp(T0); // fixed, realistic timestamp
        (seller, sellerKey) = makeAddrAndKey("seller");
        (buyer, buyerKey) = makeAddrAndKey("buyer");
        (underwriter, underwriterKey) = makeAddrAndKey("underwriter");
        (payout, payoutKey) = makeAddrAndKey("payout");
        (merchant, merchantKey) = makeAddrAndKey("merchant");
        (lender, lenderKey) = makeAddrAndKey("lender");

        token = _newToken();
        a = _deployAutorail(IERC20(address(token)), address(this));

        sellerAgent = _register(seller, "ipfs://autorail/agents/lumen-data.json", AutorailRoles.Role.Seller);
        buyerAgent = _register(buyer, "ipfs://autorail/agents/frontier-lab.json", AutorailRoles.Role.Buyer);
        underwriterAgent =
            _register(underwriter, "ipfs://autorail/agents/underwriter.json", AutorailRoles.Role.Underwriter);
        payoutAgent = _register(payout, "ipfs://autorail/agents/payout.json", AutorailRoles.Role.Payout);
        merchantAgent =
            _register(merchant, "ipfs://autorail/agents/kestrel-gpu.json", AutorailRoles.Role.Merchant);
        a.roles.setBuyerTier(buyerAgent, 1);

        // dead-shares seed, then fund the demo accounts
        _mint(address(this), C.VAULT_SEED);
        token.approve(address(a.vault), C.VAULT_SEED);
        a.vault.deposit(C.VAULT_SEED, C.DEAD);
        _mint(lender, C.LENDER_DEPOSIT);
        _mint(buyer, C.INVOICE_AMOUNT);
    }

    /// @dev Overridden by the fork suite to use the real tUSD8.
    function _newToken() internal virtual returns (MockTUSD8) {
        return new MockTUSD8();
    }

    /// @dev Overridden by the fork suite (`deal`, since the real token can't be minted).
    function _mint(address to, uint256 amount) internal virtual {
        token.mint(to, amount);
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _register(address who, string memory uri, AutorailRoles.Role role)
        internal
        returns (uint256 id)
    {
        vm.prank(who);
        id = a.identity.register(uri);
        a.roles.setRole(id, role);
    }

    function _deposit(uint256 amount) internal {
        vm.startPrank(lender);
        token.approve(address(a.vault), amount);
        a.vault.deposit(amount, lender);
        vm.stopPrank();
    }

    function _create() internal returns (bytes32 id) {
        return _createWith(INVOICE_HASH, C.INVOICE_AMOUNT);
    }

    function _createWith(bytes32 invoiceHash, uint256 amount) internal returns (bytes32 id) {
        vm.prank(seller);
        id = a.registry.create(invoiceHash, buyerAgent, amount, uint64(clock + C.DUE_IN));
    }

    function _confirmSig(bytes32 id, uint256 key, address signer, address payee, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        uint256 nonce = a.registry.nonces(signer);
        return Sigs.sign(vm, key, a.registry.confirmationDigest(id, signer, payee, nonce, deadline));
    }

    function _confirm(bytes32 id) internal {
        uint256 deadline = clock + 1 hours;
        bytes memory sig = _confirmSig(id, buyerKey, buyer, address(a.router), deadline);
        a.registry.confirm(id, buyer, address(a.router), deadline, sig);
    }

    function _payees() internal view returns (address[] memory p) {
        p = new address[](3);
        p[0] = annotatorA;
        p[1] = annotatorB;
        p[2] = merchant;
    }

    function _offer(bytes32 id, uint256 advance, uint16 feeBps)
        internal
        returns (CreditFacility.Offer memory o)
    {
        o = CreditFacility.Offer({
            receivableId: id,
            advanceAmount: advance,
            feeBps: feeBps,
            payees: _payees(),
            offerExpiry: uint64(clock + 1 hours),
            nonce: ++offerNonce
        });
    }

    function _signOffer(CreditFacility.Offer memory o, uint256 key) internal view returns (bytes memory) {
        return Sigs.sign(vm, key, a.facility.offerDigest(o));
    }

    function _fund(bytes32 id) internal returns (JobWallet jw) {
        CreditFacility.Offer memory o = _offer(id, C.ADVANCE, C.FEE_BPS);
        bytes memory sig = _signOffer(o, underwriterKey);
        vm.prank(seller);
        jw = JobWallet(a.facility.fund(o, sig));
    }

    /// @dev deposit → create → confirm → fund. Returns the receivable id and its JobWallet.
    function _funded() internal returns (bytes32 id, JobWallet jw) {
        _deposit(C.LENDER_DEPOSIT);
        id = _create();
        _confirm(id);
        jw = _fund(id);
    }

    function _grant(JobWallet jw) internal {
        vm.prank(seller);
        jw.grantSession(payout, uint64(clock + C.SESSION_TTL), C.PER_TX_CAP, C.TOTAL_CAP, _payees());
    }

    function _payAuth(uint256 key, address from, uint256 value, bytes32 nonce, uint256 validBefore)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        return Sigs.signReceive(
            vm,
            key,
            token.DOMAIN_SEPARATOR(),
            Sigs.Auth({
                from: from,
                to: address(a.router),
                value: value,
                validAfter: 0,
                validBefore: validBefore,
                nonce: nonce
            })
        );
    }

    function _repay(bytes32 id) internal {
        uint256 validBefore = clock + 1 hours;
        bytes32 nonce = a.router.authorizationNonce(id);
        (uint8 v, bytes32 r, bytes32 s) = _payAuth(buyerKey, buyer, C.INVOICE_AMOUNT, nonce, validBefore);
        vm.prank(relayer);
        a.router.payWithAuthorization(id, buyer, C.INVOICE_AMOUNT, 0, validBefore, nonce, v, r, s);
    }

    function _state(bytes32 id) internal view returns (ReceivableRegistry.State) {
        return a.registry.stateOf(id);
    }
}
