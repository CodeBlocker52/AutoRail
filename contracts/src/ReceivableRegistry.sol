// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SigCheck} from "./libraries/SigCheck.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {AutorailRoles} from "./AutorailRoles.sol";

/// @title ReceivableRegistry
/// @notice Lab invoices ("receivables"). A seller agent creates one; the buyer agent confirms it with an EIP-712
///         signature that names the Autorail RepaymentRouter as payee. After that only the CreditFacility moves
///         its state: Created → Confirmed → Funded → Repaid | Overdue → (Repaid late | Defaulted).
/// @dev Ids are `keccak256(chainid, registry, seller, invoiceHash)`, not sequential, so they can't be claimed
///      in advance. Only the invoice hash goes onchain; the invoice file stays private.
contract ReceivableRegistry is Ownable2Step, EIP712, Nonces {
    enum State {
        None,
        Created,
        Confirmed,
        Funded,
        Repaid,
        Overdue,
        Defaulted
    }

    struct Receivable {
        bytes32 invoiceHash;
        address seller; // the seller agent address that created it
        address buyer; // the address that signed the confirmation (set on confirm)
        uint256 sellerAgentId;
        uint256 buyerAgentId;
        uint256 amount; // tUSD8, 6 decimals
        uint64 dueDate;
        uint64 createdAt;
        uint64 confirmedAt;
        State state;
    }

    bytes32 public constant CONFIRMATION_TYPEHASH = keccak256(
        "Confirmation(bytes32 id,bytes32 invoiceHash,address seller,address buyer,uint256 amount,uint64 dueDate,address payee,uint256 nonce,uint256 deadline)"
    );

    AutorailRoles public immutable roles;
    /// @notice The only contract that may change a confirmed receivable's state.
    address public facility;
    /// @notice The payee every confirmation must name.
    address public repaymentRouter;

    mapping(bytes32 id => Receivable) private _receivables;
    /// @notice Invoice hashes already used (dedupe across all sellers).
    mapping(bytes32 invoiceHash => bytes32 id) public receivableOfInvoice;

    event FacilitySet(address indexed facility);
    event RepaymentRouterSet(address indexed router);
    event ReceivableCreated(
        bytes32 indexed id,
        uint256 indexed sellerAgentId,
        uint256 indexed buyerAgentId,
        address seller,
        bytes32 invoiceHash,
        uint256 amount,
        uint64 dueDate
    );
    event ReceivableConfirmed(bytes32 indexed id, address indexed buyer, uint256 nonce);
    event ReceivableStateChanged(bytes32 indexed id, State from, State to);

    error ZeroAddress();
    error NotSeller();
    error NotBuyerAgent(uint256 agentId);
    error DuplicateInvoice();
    error SelfDealing();
    error ZeroAmount();
    error AmountTooLarge();
    error DueDateInPast();
    error UnknownReceivable(bytes32 id);
    error InvalidState(bytes32 id, State state);
    error WrongPayee(address payee);
    error NotBuyer(address signer);
    error SignatureExpired(uint256 deadline);
    error InvalidSignature();
    error NotFacility();
    error RouterNotSet();

    constructor(AutorailRoles roles_, address admin)
        Ownable(admin)
        EIP712("Autorail ReceivableRegistry", "1")
    {
        if (address(roles_) == address(0)) revert ZeroAddress();
        roles = roles_;
    }

    // ─────────────────────────── admin ───────────────────────────

    function setFacility(address facility_) external onlyOwner {
        if (facility_ == address(0)) revert ZeroAddress();
        facility = facility_;
        emit FacilitySet(facility_);
    }

    function setRepaymentRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert ZeroAddress();
        repaymentRouter = router_;
        emit RepaymentRouterSet(router_);
    }

    // ─────────────────────────── sellers ───────────────────────────

    /// @notice Create a receivable. Caller must control a Seller agent.
    /// @param invoiceHash keccak256 of the invoice file (hashed client-side).
    /// @param buyerAgentId ERC-8004 id of the buyer agent (must have the Buyer role).
    /// @param amount Invoice amount in tUSD8 units.
    /// @param dueDate Unix timestamp the lab must pay by.
    function create(bytes32 invoiceHash, uint256 buyerAgentId, uint256 amount, uint64 dueDate)
        external
        returns (bytes32 id)
    {
        (bool isSeller, uint256 sellerAgentId) = roles.isAgent(msg.sender, AutorailRoles.Role.Seller);
        if (!isSeller) revert NotSeller();
        if (roles.roleOf(buyerAgentId) != AutorailRoles.Role.Buyer) revert NotBuyerAgent(buyerAgentId);
        if (
            sellerAgentId == buyerAgentId
                || roles.isAgentFor(msg.sender, buyerAgentId, AutorailRoles.Role.Buyer)
                || roles.identity().ownerOf(buyerAgentId) == roles.identity().ownerOf(sellerAgentId)
        ) revert SelfDealing();
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint128).max) revert AmountTooLarge(); // advances and fees are stored as uint128
        if (dueDate <= block.timestamp) revert DueDateInPast();
        if (receivableOfInvoice[invoiceHash] != bytes32(0)) revert DuplicateInvoice();

        id = computeId(msg.sender, invoiceHash);
        receivableOfInvoice[invoiceHash] = id;
        _receivables[id] = Receivable({
            invoiceHash: invoiceHash,
            seller: msg.sender,
            buyer: address(0),
            sellerAgentId: sellerAgentId,
            buyerAgentId: buyerAgentId,
            amount: amount,
            dueDate: dueDate,
            createdAt: uint64(block.timestamp),
            confirmedAt: 0,
            state: State.Created
        });
        emit ReceivableCreated(id, sellerAgentId, buyerAgentId, msg.sender, invoiceHash, amount, dueDate);
        emit ReceivableStateChanged(id, State.None, State.Created);
    }

    /// @notice Non-sequential receivable id.
    function computeId(address seller, bytes32 invoiceHash) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), seller, invoiceHash));
    }

    // ─────────────────────────── buyers ───────────────────────────

    /// @notice Confirm a receivable with the buyer agent's EIP-712 signature. Anyone may submit it.
    /// @param id Receivable id.
    /// @param buyer Address that signed (owner or agent wallet of the buyer agent). ERC-1271 wallets supported.
    /// @param payee Payee in the signed message. Must be the RepaymentRouter.
    /// @param deadline Signature expiry (unix seconds).
    /// @param signature 65-byte ECDSA signature or ERC-1271 signature.
    function confirm(bytes32 id, address buyer, address payee, uint256 deadline, bytes calldata signature)
        external
    {
        Receivable storage r = _get(id);
        if (r.state != State.Created) revert InvalidState(id, r.state);
        if (repaymentRouter == address(0)) revert RouterNotSet();
        if (payee != repaymentRouter) revert WrongPayee(payee);
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        if (!roles.isAgentFor(buyer, r.buyerAgentId, AutorailRoles.Role.Buyer)) revert NotBuyer(buyer);

        uint256 nonce = _useNonce(buyer);
        bytes32 digest = confirmationDigest(id, buyer, payee, nonce, deadline);
        if (!SigCheck.isValid(buyer, digest, signature)) revert InvalidSignature();

        r.buyer = buyer;
        r.confirmedAt = uint64(block.timestamp);
        r.state = State.Confirmed;
        emit ReceivableConfirmed(id, buyer, nonce);
        emit ReceivableStateChanged(id, State.Created, State.Confirmed);
    }

    /// @notice EIP-712 digest the buyer signs for `confirm`.
    function confirmationDigest(bytes32 id, address buyer, address payee, uint256 nonce, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        Receivable storage r = _get(id);
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CONFIRMATION_TYPEHASH,
                    id,
                    r.invoiceHash,
                    r.seller,
                    buyer,
                    r.amount,
                    r.dueDate,
                    payee,
                    nonce,
                    deadline
                )
            )
        );
    }

    /// @notice EIP-712 domain separator (for off-chain signers).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ─────────────────────────── facility ───────────────────────────

    /// @notice Move a receivable to `to`. CreditFacility only; only the transitions of the state machine.
    function transition(bytes32 id, State to) external {
        if (msg.sender != facility) revert NotFacility();
        Receivable storage r = _get(id);
        State from = r.state;
        bool ok = (from == State.Confirmed && to == State.Funded)
            || (from == State.Funded && to == State.Repaid) || (from == State.Funded && to == State.Overdue)
            || (from == State.Overdue && to == State.Repaid)
            || (from == State.Overdue && to == State.Defaulted);
        if (!ok) revert InvalidState(id, from);
        r.state = to;
        emit ReceivableStateChanged(id, from, to);
    }

    // ─────────────────────────── views ───────────────────────────

    function get(bytes32 id) external view returns (Receivable memory) {
        return _get(id);
    }

    function stateOf(bytes32 id) external view returns (State) {
        return _receivables[id].state;
    }

    function _get(bytes32 id) private view returns (Receivable storage r) {
        r = _receivables[id];
        if (r.state == State.None) revert UnknownReceivable(id);
    }
}
