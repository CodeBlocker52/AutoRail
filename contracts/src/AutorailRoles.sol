// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC8004Identity} from "./interfaces/IERC8004.sol";

/// @title AutorailRoles
/// @notice Maps ERC-8004 agent ids to Autorail roles (Seller, Buyer, Underwriter, Payout, Merchant) and buyer tiers.
/// @dev The admin assigns roles; whether an address speaks for an agent is always checked live against the
///      ERC-8004 Identity Registry (current NFT owner or the registered `agentWallet`), so a transferred agent NFT
///      immediately changes who can act.
contract AutorailRoles is Ownable2Step {
    enum Role {
        None,
        Seller,
        Buyer,
        Underwriter,
        Payout,
        Merchant
    }

    /// @notice The ERC-8004 Identity Registry.
    IERC8004Identity public immutable identity;

    /// @notice Role assigned to each agent id. ERC-8004 ids start at 0, so `None` means unassigned.
    mapping(uint256 agentId => Role) public roleOf;
    /// @notice Credit tier of buyer agents: 1 (best) to 3. 0 = not set.
    mapping(uint256 agentId => uint8) public buyerTier;
    /// @dev role => account => agentId + 1 (0 = none). The account is the owner at assignment time.
    mapping(Role => mapping(address => uint256)) private _agentPlusOne;

    event RoleSet(uint256 indexed agentId, Role role, address indexed account);
    event BuyerTierSet(uint256 indexed agentId, uint8 tier);

    error ZeroAddress();
    error InvalidRole();
    error InvalidTier(uint8 tier);
    error NotABuyer(uint256 agentId);

    /// @param identity_ ERC-8004 Identity Registry.
    /// @param admin Initial owner (Ownable2Step).
    constructor(IERC8004Identity identity_, address admin) Ownable(admin) {
        if (address(identity_) == address(0)) revert ZeroAddress();
        identity = identity_;
    }

    /// @notice Assign `role` to `agentId`. Reverts if the agent doesn't exist in the Identity Registry.
    function setRole(uint256 agentId, Role role) external onlyOwner {
        if (role == Role.None) revert InvalidRole();
        address account = identity.ownerOf(agentId); // reverts for unknown agents
        roleOf[agentId] = role;
        _agentPlusOne[role][account] = agentId + 1;
        emit RoleSet(agentId, role, account);
    }

    /// @notice Set the credit tier (1–3) of a buyer agent.
    function setBuyerTier(uint256 agentId, uint8 tier) external onlyOwner {
        if (roleOf[agentId] != Role.Buyer) revert NotABuyer(agentId);
        if (tier == 0 || tier > 3) revert InvalidTier(tier);
        buyerTier[agentId] = tier;
        emit BuyerTierSet(agentId, tier);
    }

    /// @notice Whether `account` currently speaks for `agentId` in `role` (NFT owner or registered agent wallet).
    function isAgentFor(address account, uint256 agentId, Role role) public view returns (bool) {
        if (account == address(0) || role == Role.None || roleOf[agentId] != role) return false;
        return identity.ownerOf(agentId) == account || identity.getAgentWallet(agentId) == account;
    }

    /// @notice The agent `account` was assigned for `role`, if it still controls it.
    /// @return ok True if `account` currently controls an agent with that role.
    /// @return agentId The agent id (0 if `ok` is false; note 0 is also a valid id, so check `ok`).
    function isAgent(address account, Role role) external view returns (bool ok, uint256 agentId) {
        uint256 plusOne = _agentPlusOne[role][account];
        if (plusOne == 0) return (false, 0);
        agentId = plusOne - 1;
        ok = isAgentFor(account, agentId, role);
        if (!ok) agentId = 0;
    }
}
