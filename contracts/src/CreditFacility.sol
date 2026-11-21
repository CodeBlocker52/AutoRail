// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AutorailRoles} from "./AutorailRoles.sol";
import {AutorailVault} from "./AutorailVault.sol";
import {ReceivableRegistry} from "./ReceivableRegistry.sol";
import {JobWallet} from "./JobWallet.sol";
import {JobWalletFactory} from "./JobWalletFactory.sol";
import {RiskPricing} from "./libraries/RiskPricing.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004.sol";

/// @title CreditFacility
/// @notice Funds confirmed receivables. The seller submits an EIP-712 Offer signed by an Underwriter agent;
///         the facility enforces RiskPricing caps and the seller's limit, deploys a JobWallet and has the vault
///         lend into it. Holds the credit record that pricing reads. Overdue and default are permissionless.
contract CreditFacility is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using RiskPricing for RiskPricing.CreditRecord;

    /// @notice Underwriter-signed funding offer.
    struct Offer {
        bytes32 receivableId;
        uint256 advanceAmount;
        uint16 feeBps;
        address[] payees;
        uint64 offerExpiry;
        uint256 nonce;
    }

    struct Advance {
        address jobWallet;
        uint128 principal;
        uint128 fee;
        uint64 fundedAt;
    }

    bytes32 public constant OFFER_TYPEHASH = keccak256(
        "Offer(bytes32 receivableId,uint256 advanceAmount,uint16 feeBps,address[] payees,uint64 offerExpiry,uint256 nonce)"
    );

    ReceivableRegistry public immutable registry;
    AutorailVault public immutable vault;
    JobWalletFactory public immutable factory;
    AutorailRoles public immutable roles;
    IERC8004Reputation public immutable reputation;

    /// @notice The RepaymentRouter (only it may settle repayments).
    address public router;
    /// @notice Time after the due date before anyone may mark a receivable Overdue.
    uint64 public gracePeriod = 3 days;
    /// @notice Time after the due date before anyone may mark a receivable Defaulted.
    uint64 public defaultPeriod = 30 days;

    mapping(uint256 sellerAgentId => RiskPricing.CreditRecord) private _credit;
    /// @notice Principal currently outstanding per seller agent.
    mapping(uint256 sellerAgentId => uint256) public outstandingOf;
    mapping(bytes32 receivableId => Advance) private _advances;
    /// @notice Offer nonces already used, per underwriter address.
    mapping(address underwriter => mapping(uint256 nonce => bool)) public offerNonceUsed;

    event RouterSet(address indexed router);
    event PeriodsSet(uint64 gracePeriod, uint64 defaultPeriod);
    event Funded(bytes32 indexed id, address indexed jobWallet, uint256 advance, uint256 fee);
    event RepaymentRecorded(
        bytes32 indexed id, uint256 indexed sellerAgentId, uint256 principal, uint256 fee, bool onTime
    );
    event MarkedOverdue(bytes32 indexed id);
    event Defaulted(bytes32 indexed id, uint256 indexed sellerAgentId, uint256 principal, uint256 recovered);
    event FeedbackFailed(bytes32 indexed id, uint256 indexed agentId);

    error ZeroAddress();
    error NotSeller();
    error NotRouter();
    error NotConfirmed();
    error InvalidState(bytes32 id, ReceivableRegistry.State state);
    error OfferExpired(uint64 expiry);
    error OfferMismatch();
    error InvalidUnderwriter(address signer);
    error OfferNonceUsed(uint256 nonce);
    error AdvanceTooHigh(uint256 advance, uint256 max);
    error FeeBelowFloor(uint16 feeBps, uint16 floorBps);
    error OverSellerLimit(uint256 wouldOwe, uint256 limit);
    error NoPayees();
    error NotYet(uint256 availableAt);
    error InvalidPeriods();

    constructor(
        ReceivableRegistry registry_,
        AutorailVault vault_,
        JobWalletFactory factory_,
        AutorailRoles roles_,
        IERC8004Reputation reputation_,
        address admin
    ) Ownable(admin) EIP712("Autorail CreditFacility", "1") {
        if (
            address(registry_) == address(0) || address(vault_) == address(0)
                || address(factory_) == address(0) || address(roles_) == address(0)
                || address(reputation_) == address(0)
        ) revert ZeroAddress();
        registry = registry_;
        vault = vault_;
        factory = factory_;
        roles = roles_;
        reputation = reputation_;
    }

    // ─────────────────────────── admin ───────────────────────────

    function setRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert ZeroAddress();
        router = router_;
        emit RouterSet(router_);
    }

    /// @notice Testnet uses short periods (e.g. 10 min / 30 min) so overdue/default can be demonstrated.
    function setPeriods(uint64 grace, uint64 default_) external onlyOwner {
        if (grace == 0 || default_ <= grace) revert InvalidPeriods();
        gracePeriod = grace;
        defaultPeriod = default_;
        emit PeriodsSet(grace, default_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─────────────────────────── pricing views ───────────────────────────

    function creditOf(uint256 sellerAgentId) external view returns (RiskPricing.CreditRecord memory) {
        return _credit[sellerAgentId];
    }

    /// @notice Terms the underwriter must stay within for receivable `id`, and the largest allowed advance.
    function quote(bytes32 id) public view returns (RiskPricing.Terms memory terms, uint256 maxAdvance) {
        ReceivableRegistry.Receivable memory r = registry.get(id);
        terms = RiskPricing.terms(_credit[r.sellerAgentId], roles.buyerTier(r.buyerAgentId));
        maxAdvance = (r.amount * terms.maxAdvanceBps) / RiskPricing.BPS;
        uint256 headroom = terms.sellerLimit > outstandingOf[r.sellerAgentId]
            ? terms.sellerLimit - outstandingOf[r.sellerAgentId]
            : 0;
        if (headroom < maxAdvance) maxAdvance = headroom;
    }

    /// @notice EIP-712 digest an underwriter signs for `offer`.
    function offerDigest(Offer calldata offer) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    OFFER_TYPEHASH,
                    offer.receivableId,
                    offer.advanceAmount,
                    offer.feeBps,
                    keccak256(abi.encodePacked(offer.payees)),
                    offer.offerExpiry,
                    offer.nonce
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function advanceOf(bytes32 id) external view returns (Advance memory) {
        return _advances[id];
    }

    // ─────────────────────────── funding ───────────────────────────

    /// @notice Accept an underwriter offer: deploy the JobWallet and draw the advance from the vault.
    /// @dev Called by the seller agent address that created the receivable.
    function fund(Offer calldata offer, bytes calldata underwriterSig)
        external
        nonReentrant
        whenNotPaused
        returns (address jobWallet)
    {
        bytes32 id = offer.receivableId;
        ReceivableRegistry.Receivable memory r = registry.get(id);
        if (msg.sender != r.seller) revert NotSeller();
        if (r.state == ReceivableRegistry.State.Created) revert NotConfirmed();
        if (r.state != ReceivableRegistry.State.Confirmed) revert InvalidState(id, r.state);
        if (block.timestamp > offer.offerExpiry) revert OfferExpired(offer.offerExpiry);
        if (offer.payees.length == 0) revert NoPayees();

        address signer = ECDSA.recover(offerDigest(offer), underwriterSig);
        (bool isUnderwriter,) = roles.isAgent(signer, AutorailRoles.Role.Underwriter);
        if (!isUnderwriter) revert InvalidUnderwriter(signer);
        if (offerNonceUsed[signer][offer.nonce]) revert OfferNonceUsed(offer.nonce);
        offerNonceUsed[signer][offer.nonce] = true;

        RiskPricing.Terms memory terms =
            RiskPricing.terms(_credit[r.sellerAgentId], roles.buyerTier(r.buyerAgentId));
        uint256 maxAdvance = (r.amount * terms.maxAdvanceBps) / RiskPricing.BPS;
        if (offer.advanceAmount == 0 || offer.advanceAmount > maxAdvance) {
            revert AdvanceTooHigh(offer.advanceAmount, maxAdvance);
        }
        if (offer.feeBps < terms.feeBps) revert FeeBelowFloor(offer.feeBps, terms.feeBps);
        uint256 wouldOwe = outstandingOf[r.sellerAgentId] + offer.advanceAmount;
        if (wouldOwe > terms.sellerLimit) revert OverSellerLimit(wouldOwe, terms.sellerLimit);

        uint256 fee = RiskPricing.feeOf(offer.advanceAmount, offer.feeBps);
        if (offer.advanceAmount + fee > r.amount) revert AdvanceTooHigh(offer.advanceAmount, maxAdvance);

        // effects
        outstandingOf[r.sellerAgentId] = wouldOwe;
        registry.transition(id, ReceivableRegistry.State.Funded);
        // interactions (trusted, wired contracts)
        jobWallet = factory.create(id, r.seller, offer.payees);
        _advances[id] = Advance({
            jobWallet: jobWallet,
            principal: uint128(offer.advanceAmount),
            fee: uint128(fee),
            fundedAt: uint64(block.timestamp)
        });
        vault.lend(jobWallet, offer.advanceAmount);
        emit Funded(id, jobWallet, offer.advanceAmount, fee);
    }

    // ─────────────────────────── repayment (router) ───────────────────────────

    /// @notice Record a repayment: state → Repaid, update the credit record. RepaymentRouter only.
    /// @return principal Principal to return to the vault.
    /// @return fee Fee owed to the vault.
    /// @return jobWallet The JobWallet to sweep.
    function settleRepayment(bytes32 id, bool onTime)
        external
        returns (uint256 principal, uint256 fee, address jobWallet)
    {
        if (msg.sender != router) revert NotRouter();
        ReceivableRegistry.Receivable memory r = registry.get(id);
        Advance memory a = _advances[id];
        registry.transition(id, ReceivableRegistry.State.Repaid); // reverts unless Funded/Overdue
        outstandingOf[r.sellerAgentId] -= a.principal;
        RiskPricing.CreditRecord storage c = _credit[r.sellerAgentId];
        if (onTime) c.onTime += 1;
        else c.late += 1;
        emit RepaymentRecorded(id, r.sellerAgentId, a.principal, a.fee, onTime);
        return (a.principal, a.fee, a.jobWallet);
    }

    // ─────────────────────────── overdue / default (permissionless) ───────────────────────────

    /// @notice Anyone may mark a Funded receivable Overdue after `dueDate + gracePeriod`.
    function markOverdue(bytes32 id) public {
        ReceivableRegistry.Receivable memory r = registry.get(id);
        if (r.state != ReceivableRegistry.State.Funded) revert InvalidState(id, r.state);
        uint256 at = uint256(r.dueDate) + gracePeriod;
        if (block.timestamp <= at) revert NotYet(at);
        registry.transition(id, ReceivableRegistry.State.Overdue);
        emit MarkedOverdue(id);
    }

    /// @notice Anyone may default a receivable after `dueDate + defaultPeriod`: the JobWallet's balance goes back
    ///         to the vault, the rest of the principal is written off, and the seller gets negative feedback.
    function markDefault(bytes32 id) external nonReentrant {
        ReceivableRegistry.Receivable memory r = registry.get(id);
        uint256 at = uint256(r.dueDate) + defaultPeriod;
        if (block.timestamp <= at) revert NotYet(at);
        if (r.state == ReceivableRegistry.State.Funded) markOverdue(id);
        else if (r.state != ReceivableRegistry.State.Overdue) revert InvalidState(id, r.state);

        Advance memory a = _advances[id];
        registry.transition(id, ReceivableRegistry.State.Defaulted);
        outstandingOf[r.sellerAgentId] -= a.principal;
        _credit[r.sellerAgentId].defaults += 1;
        uint256 recovered = JobWallet(a.jobWallet).sweep(address(vault));
        vault.writeOff(a.principal);
        try reputation.giveFeedback(r.sellerAgentId, 0, 0, "credit", "defaulted", "", "", id) {}
        catch {
            emit FeedbackFailed(id, r.sellerAgentId);
        }
        emit Defaulted(id, r.sellerAgentId, a.principal, recovered);
    }
}
