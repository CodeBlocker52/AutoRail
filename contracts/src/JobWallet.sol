// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title JobWallet
/// @notice Holds one invoice's advance. The seller (owner) grants scoped session keys to its payout agent:
///         approved payees only, a per-payment cap, a total cap and an expiry; revocable instantly.
///         Every limit is enforced here, so a prompt-injected or compromised agent can only fail.
/// @dev Deployed as an EIP-1167 clone by JobWalletFactory. At repayment the router sweeps the unspent balance.
///      `pay` checks, in this order: SessionRevoked → SessionExpired → PayeeNotAllowed → OverPerTxCap → OverTotalCap.
contract JobWallet is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Session {
        uint64 expiry;
        bool exists;
        bool revoked;
        uint32 version;
        uint128 perTxCap;
        uint128 totalCap;
        uint128 spent;
    }

    /// @notice The seller (JobWallet owner).
    address public owner;
    /// @notice The receivable this wallet funds.
    bytes32 public receivableId;
    IERC20 public token;
    /// @notice CreditFacility (may sweep on default).
    address public facility;
    /// @notice RepaymentRouter (sweeps at repayment).
    address public router;
    /// @notice True once swept; no more payments.
    bool public closed;

    /// @notice Payees the underwriter approved for this job.
    mapping(address payee => bool) public isApprovedPayee;
    address[] private _approvedPayees;

    mapping(address key => Session) private _sessions;
    /// @dev key => session version => payee => allowed. A re-grant bumps the version, clearing old payees.
    mapping(address key => mapping(uint32 version => mapping(address payee => bool))) private _sessionPayee;

    event JobWalletInitialized(address indexed owner, bytes32 indexed receivableId, address[] payees);
    event SessionGranted(
        address indexed key,
        uint64 expiry,
        uint128 perTxCap,
        uint128 totalCap,
        address[] payees,
        uint32 version
    );
    event SessionKeyRevoked(address indexed key);
    event Paid(address indexed key, address indexed payee, uint256 amount, bytes32 memo);
    event Swept(address indexed to, uint256 amount);

    error NotOwner();
    error NotController();
    error ZeroAddress();
    error Closed();
    error NoSession(address key);
    error SessionRevoked();
    error SessionExpired();
    error PayeeNotAllowed(address payee);
    error OverPerTxCap(uint256 amount, uint256 cap);
    error OverTotalCap(uint256 wouldSpend, uint256 cap);
    error InsufficientBalance(uint256 amount, uint256 balance);
    error InvalidSession();
    error ZeroAmount();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time setup by the factory.
    function initialize(
        address owner_,
        bytes32 receivableId_,
        IERC20 token_,
        address[] calldata payees,
        address facility_,
        address router_
    ) external initializer {
        if (
            owner_ == address(0) || address(token_) == address(0) || facility_ == address(0)
                || router_ == address(0)
        ) {
            revert ZeroAddress();
        }
        owner = owner_;
        receivableId = receivableId_;
        token = token_;
        facility = facility_;
        router = router_;
        for (uint256 i; i < payees.length; i++) {
            address p = payees[i];
            if (p == address(0)) revert ZeroAddress();
            if (!isApprovedPayee[p]) {
                isApprovedPayee[p] = true;
                _approvedPayees.push(p);
            }
        }
        emit JobWalletInitialized(owner_, receivableId_, payees);
    }

    // ─────────────────────────── owner ───────────────────────────

    /// @notice Grant (or replace) a session for `key`. `payees` must be a subset of the approved list.
    function grantSession(
        address key,
        uint64 expiry,
        uint128 perTxCap,
        uint128 totalCap,
        address[] calldata payees
    ) external onlyOwner {
        if (closed) revert Closed();
        if (key == address(0)) revert ZeroAddress();
        if (
            expiry <= block.timestamp || perTxCap == 0 || totalCap == 0 || perTxCap > totalCap
                || payees.length == 0
        ) {
            revert InvalidSession();
        }
        Session storage s = _sessions[key];
        uint32 version = s.version + 1;
        for (uint256 i; i < payees.length; i++) {
            if (!isApprovedPayee[payees[i]]) revert PayeeNotAllowed(payees[i]);
            _sessionPayee[key][version][payees[i]] = true;
        }
        _sessions[key] = Session({
            expiry: expiry,
            exists: true,
            revoked: false,
            version: version,
            perTxCap: perTxCap,
            totalCap: totalCap,
            spent: 0
        });
        emit SessionGranted(key, expiry, perTxCap, totalCap, payees, version);
    }

    /// @notice Revoke `key` immediately.
    function revokeSession(address key) external onlyOwner {
        Session storage s = _sessions[key];
        if (!s.exists) revert NoSession(key);
        if (s.revoked) revert SessionRevoked();
        s.revoked = true;
        emit SessionKeyRevoked(key);
    }

    // ─────────────────────────── spending ───────────────────────────

    /// @notice Pay `amount` to `payee`. Called by a session key (or the owner, approved payees only).
    /// @param memo Free 32 bytes; for x402 merchants, the request id.
    function pay(address payee, uint256 amount, bytes32 memo) external nonReentrant {
        if (closed) revert Closed();
        if (amount == 0) revert ZeroAmount();
        if (msg.sender == owner) {
            if (!isApprovedPayee[payee]) revert PayeeNotAllowed(payee);
        } else {
            Session storage s = _sessions[msg.sender];
            if (!s.exists) revert NoSession(msg.sender);
            if (s.revoked) revert SessionRevoked();
            if (block.timestamp >= s.expiry) revert SessionExpired();
            if (!_sessionPayee[msg.sender][s.version][payee]) revert PayeeNotAllowed(payee);
            if (amount > s.perTxCap) revert OverPerTxCap(amount, s.perTxCap);
            uint256 wouldSpend = uint256(s.spent) + amount;
            if (wouldSpend > s.totalCap) revert OverTotalCap(wouldSpend, s.totalCap);
            s.spent = uint128(wouldSpend);
        }
        uint256 bal = token.balanceOf(address(this));
        if (amount > bal) revert InsufficientBalance(amount, bal);
        token.safeTransfer(payee, amount);
        emit Paid(msg.sender, payee, amount, memo);
    }

    /// @notice Send the whole balance to `to` and close the wallet. Router (repayment) or facility (default).
    function sweep(address to) external nonReentrant returns (uint256 amount) {
        if (msg.sender != router && msg.sender != facility) revert NotController();
        if (to == address(0)) revert ZeroAddress();
        closed = true;
        amount = token.balanceOf(address(this));
        if (amount > 0) token.safeTransfer(to, amount);
        emit Swept(to, amount);
    }

    // ─────────────────────────── views ───────────────────────────

    function sessionOf(address key) external view returns (Session memory) {
        return _sessions[key];
    }

    function isSessionPayee(address key, address payee) external view returns (bool) {
        return _sessionPayee[key][_sessions[key].version][payee];
    }

    function approvedPayees() external view returns (address[] memory) {
        return _approvedPayees;
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
