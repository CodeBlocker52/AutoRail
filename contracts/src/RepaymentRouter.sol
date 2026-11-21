// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AutorailVault} from "./AutorailVault.sol";
import {CreditFacility} from "./CreditFacility.sol";
import {ReceivableRegistry} from "./ReceivableRegistry.sol";
import {JobWallet} from "./JobWallet.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004.sol";

/// @title RepaymentRouter
/// @notice The payee every confirmed invoice names. The lab pays once (gasless EIP-3009 or approve + pay) and,
///         in the same transaction: the vault gets principal + fee first, the JobWallet's unspent balance is
///         swept to the seller, the seller gets the remainder, and ERC-8004 feedback is written.
/// @dev EIP-3009 pattern based on Aevum Starter Kit's Checkout (MIT, PQA Labs): `receiveWithAuthorization`
///      (can't be front-run into a plain transfer) and a signed nonce bound to the receivable,
///      `authorizationNonce(id)`. Unlike the kit, the amount is enforced onchain: it must equal the invoice.
contract RepaymentRouter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    ReceivableRegistry public immutable registry;
    CreditFacility public immutable facility;
    AutorailVault public immutable vault;
    IERC8004Reputation public immutable reputation;

    /// @notice ERC-8004 feedback values (valueDecimals = 0).
    int128 public constant FEEDBACK_ON_TIME = 100;
    int128 public constant FEEDBACK_LATE = 50;

    event Repaid(
        bytes32 indexed id,
        address indexed from,
        uint256 vaultAmount,
        uint256 sellerAmount,
        uint256 swept,
        bool onTime
    );
    event FeedbackFailed(bytes32 indexed id, uint256 indexed agentId);

    error ZeroAddress();
    error AlreadyRepaid(bytes32 id);
    error NotPayable(bytes32 id, ReceivableRegistry.State state);
    error WrongAmount(uint256 value, uint256 amount);
    error WrongNonce(bytes32 nonce, bytes32 expected);
    error NotBuyer(address from, address buyer);

    constructor(
        IERC20 token_,
        ReceivableRegistry registry_,
        CreditFacility facility_,
        AutorailVault vault_,
        IERC8004Reputation reputation_,
        address admin
    ) Ownable(admin) {
        if (
            address(token_) == address(0) || address(registry_) == address(0)
                || address(facility_) == address(0) || address(vault_) == address(0)
                || address(reputation_) == address(0)
        ) revert ZeroAddress();
        token = token_;
        registry = registry_;
        facility = facility_;
        vault = vault_;
        reputation = reputation_;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice The EIP-3009 nonce a buyer must sign to pay receivable `id` through this router.
    function authorizationNonce(bytes32 id) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), id));
    }

    /// @notice Pay receivable `id` with the buyer's `ReceiveWithAuthorization` signature. Anyone (a relayer) may
    ///         submit; the buyer needs no gas.
    function payWithAuthorization(
        bytes32 id,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused {
        ReceivableRegistry.Receivable memory rec = _checkPayable(id, from, value);
        bytes32 expected = authorizationNonce(id);
        if (nonce != expected) revert WrongNonce(nonce, expected);
        IERC3009(address(token))
            .receiveWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, v, r, s);
        _settle(id, rec, from);
    }

    /// @notice Fallback: the buyer approves this router for the invoice amount and pays directly.
    function pay(bytes32 id) external nonReentrant whenNotPaused {
        ReceivableRegistry.Receivable memory rec = registry.get(id);
        rec = _checkPayable(id, msg.sender, rec.amount);
        token.safeTransferFrom(msg.sender, address(this), rec.amount);
        _settle(id, rec, msg.sender);
    }

    function _checkPayable(bytes32 id, address from, uint256 value)
        private
        view
        returns (ReceivableRegistry.Receivable memory rec)
    {
        rec = registry.get(id);
        if (rec.state == ReceivableRegistry.State.Repaid) revert AlreadyRepaid(id);
        if (rec.state != ReceivableRegistry.State.Funded && rec.state != ReceivableRegistry.State.Overdue) {
            revert NotPayable(id, rec.state);
        }
        if (value != rec.amount) revert WrongAmount(value, rec.amount);
        if (from != rec.buyer) revert NotBuyer(from, rec.buyer);
    }

    /// @dev Waterfall. The router now holds exactly `rec.amount`.
    function _settle(bytes32 id, ReceivableRegistry.Receivable memory rec, address from) private {
        bool onTime = block.timestamp <= rec.dueDate;
        (uint256 principal, uint256 fee, address jobWallet) = facility.settleRepayment(id, onTime);
        (uint256 toVault, uint256 toSeller, uint256 swept) = _waterfall(rec, principal, fee, jobWallet);
        _feedback(id, rec.sellerAgentId, onTime);
        emit Repaid(id, from, toVault, toSeller, swept, onTime);
    }

    /// @dev 1. vault pulls principal + fee · 2. JobWallet balance swept to the seller · 3. remainder to the seller.
    function _waterfall(
        ReceivableRegistry.Receivable memory rec,
        uint256 principal,
        uint256 fee,
        address jobWallet
    ) private returns (uint256 toVault, uint256 toSeller, uint256 swept) {
        uint256 amount = rec.amount;
        uint256 vaultPrincipal = principal < amount ? principal : amount;
        uint256 vaultFee = fee < amount - vaultPrincipal ? fee : amount - vaultPrincipal;
        toVault = vaultPrincipal + vaultFee;
        toSeller = amount - toVault;
        token.forceApprove(address(vault), toVault);
        vault.repay(vaultPrincipal, vaultFee);
        swept = JobWallet(jobWallet).sweep(rec.seller);
        if (toSeller > 0) token.safeTransfer(rec.seller, toSeller);
    }

    /// @dev ERC-8004 reputation. A failure here never blocks a repayment.
    function _feedback(bytes32 id, uint256 sellerAgentId, bool onTime) private {
        try reputation.giveFeedback(
            sellerAgentId,
            onTime ? FEEDBACK_ON_TIME : FEEDBACK_LATE,
            0,
            "credit",
            onTime ? "repaid_on_time" : "repaid_late",
            "",
            "",
            id
        ) {}
        catch {
            emit FeedbackFailed(id, sellerAgentId);
        }
    }
}
