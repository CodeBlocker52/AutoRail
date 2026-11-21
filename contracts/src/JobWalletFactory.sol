// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {JobWallet} from "./JobWallet.sol";

/// @title JobWalletFactory
/// @notice Deploys one EIP-1167 JobWallet clone per receivable, at an address derived from the receivable id.
contract JobWalletFactory is Ownable2Step {
    address public immutable implementation;
    IERC20 public immutable token;
    address public facility;
    address public router;

    mapping(bytes32 receivableId => address) public walletOf;

    event WiringSet(address indexed facility, address indexed router);
    event JobWalletCreated(bytes32 indexed receivableId, address indexed wallet, address indexed owner);

    error ZeroAddress();
    error NotFacility();
    error AlreadyCreated(bytes32 receivableId);

    constructor(address implementation_, IERC20 token_, address admin) Ownable(admin) {
        if (implementation_ == address(0) || address(token_) == address(0)) revert ZeroAddress();
        implementation = implementation_;
        token = token_;
    }

    function setWiring(address facility_, address router_) external onlyOwner {
        if (facility_ == address(0) || router_ == address(0)) revert ZeroAddress();
        facility = facility_;
        router = router_;
        emit WiringSet(facility_, router_);
    }

    /// @notice Create the JobWallet for `receivableId`. CreditFacility only.
    function create(bytes32 receivableId, address owner, address[] calldata payees)
        external
        returns (address wallet)
    {
        if (msg.sender != facility) revert NotFacility();
        if (walletOf[receivableId] != address(0)) revert AlreadyCreated(receivableId);
        wallet = Clones.cloneDeterministic(implementation, receivableId);
        walletOf[receivableId] = wallet;
        JobWallet(wallet).initialize(owner, receivableId, token, payees, facility, router);
        emit JobWalletCreated(receivableId, wallet, owner);
    }

    /// @notice Address the JobWallet for `receivableId` has (or will have).
    function predict(bytes32 receivableId) external view returns (address) {
        return Clones.predictDeterministicAddress(implementation, receivableId);
    }
}
