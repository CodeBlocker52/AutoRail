// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title AutorailVault
/// @notice ERC-4626 vault over tUSD8. Lenders deposit; the CreditFacility lends to per-invoice JobWallets;
///         the RepaymentRouter returns principal + fee. `totalAssets = idle + outstandingPrincipal`.
/// @dev Inflation-attack defence: `_decimalsOffset() = 6` plus a dead-shares seed at deploy time.
///      Withdrawals are capped at idle liquidity (money out on advances returns at repayment).
contract AutorailVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Principal currently out on advances.
    uint256 public outstandingPrincipal;
    /// @notice Total fees ever received (informational).
    uint256 public totalFeesEarned;
    /// @notice Total principal ever written off (informational).
    uint256 public totalWrittenOff;

    /// @notice The only address allowed to `lend` and `writeOff`.
    address public facility;
    /// @notice The only address allowed to `repay`.
    address public router;

    event FacilitySet(address indexed facility);
    event RouterSet(address indexed router);
    event Lent(address indexed to, uint256 amount);
    event Repaid(uint256 principal, uint256 fee);
    event WrittenOff(uint256 principal);

    error ZeroAddress();
    error NotFacility();
    error NotRouter();
    error InsufficientLiquidity(uint256 requested, uint256 idle);
    error RepayExceedsOutstanding(uint256 principal, uint256 outstanding);

    modifier onlyFacility() {
        if (msg.sender != facility) revert NotFacility();
        _;
    }

    /// @param asset_ tUSD8 (6 decimals).
    /// @param admin Initial owner.
    constructor(IERC20 asset_, address admin)
        ERC20("Autorail Vault tUSD8", "avUSD8")
        ERC4626(asset_)
        Ownable(admin)
    {}

    // ─────────────────────────── admin ───────────────────────────

    function setFacility(address facility_) external onlyOwner {
        if (facility_ == address(0)) revert ZeroAddress();
        facility = facility_;
        emit FacilitySet(facility_);
    }

    function setRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert ZeroAddress();
        router = router_;
        emit RouterSet(router_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─────────────────────────── accounting ───────────────────────────

    /// @notice tUSD8 sitting in the vault, available to lend or withdraw.
    function idle() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256) {
        return idle() + outstandingPrincipal;
    }

    /// @dev 6 extra decimals of share precision: makes donation/inflation attacks uneconomic.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    /// @inheritdoc ERC4626
    function maxDeposit(address receiver) public view override returns (uint256) {
        return paused() ? 0 : super.maxDeposit(receiver);
    }

    /// @inheritdoc ERC4626
    function maxMint(address receiver) public view override returns (uint256) {
        return paused() ? 0 : super.maxMint(receiver);
    }

    /// @notice Capped at idle liquidity.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        if (paused()) return 0;
        return Math.min(super.maxWithdraw(owner_), idle());
    }

    /// @notice Capped at the shares that idle liquidity can redeem.
    function maxRedeem(address owner_) public view override returns (uint256) {
        if (paused()) return 0;
        return Math.min(super.maxRedeem(owner_), _convertToShares(idle(), Math.Rounding.Floor));
    }

    // ─────────────────────────── lenders ───────────────────────────

    /// @notice Deposit with an EIP-2612 permit: one signature plus this transaction, no separate approve.
    /// @dev The permit call is wrapped in try/catch so a front-run permit (same signature submitted by someone
    ///      else) doesn't block the deposit; the allowance check in `deposit` still protects the owner.
    function depositWithPermit(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 shares) {
        try IERC20Permit(asset()).permit(msg.sender, address(this), assets, deadline, v, r, s) {} catch {}
        return deposit(assets, receiver);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
        whenNotPaused
    {
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
        whenNotPaused
    {
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    // ─────────────────────────── credit operations ───────────────────────────

    /// @notice Send `amount` of idle tUSD8 to a JobWallet. CreditFacility only.
    function lend(address to, uint256 amount) external onlyFacility nonReentrant whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        uint256 available = idle();
        if (amount > available) revert InsufficientLiquidity(amount, available);
        outstandingPrincipal += amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit Lent(to, amount);
    }

    /// @notice Pull `principal + fee` from the router and close that much principal. RepaymentRouter only.
    /// @dev Pull (not push) so the vault only books money it actually received.
    function repay(uint256 principal, uint256 fee) external nonReentrant {
        if (msg.sender != router) revert NotRouter();
        if (principal > outstandingPrincipal) {
            revert RepayExceedsOutstanding(principal, outstandingPrincipal);
        }
        outstandingPrincipal -= principal;
        totalFeesEarned += fee;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), principal + fee);
        emit Repaid(principal, fee);
    }

    /// @notice Write off defaulted principal. Share price drops by the loss. CreditFacility only.
    function writeOff(uint256 principal) external onlyFacility {
        if (principal > outstandingPrincipal) {
            revert RepayExceedsOutstanding(principal, outstandingPrincipal);
        }
        outstandingPrincipal -= principal;
        totalWrittenOff += principal;
        emit WrittenOff(principal);
    }
}
