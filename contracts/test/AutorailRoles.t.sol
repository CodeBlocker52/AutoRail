// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {AutorailRoles} from "../src/AutorailRoles.sol";
import {IERC8004Identity} from "../src/interfaces/IERC8004.sol";

contract AutorailRolesTest is Base {
    function test_constructor_rejectsZeroIdentity() public {
        vm.expectRevert(AutorailRoles.ZeroAddress.selector);
        new AutorailRoles(IERC8004Identity(address(0)), address(this));
    }

    function test_agentIdsStartAtZero() public view {
        assertEq(sellerAgent, 0);
        assertEq(merchantAgent, 4);
    }

    function test_isAgent_returnsAgentForController() public view {
        (bool ok, uint256 id) = a.roles.isAgent(seller, AutorailRoles.Role.Seller);
        assertTrue(ok);
        assertEq(id, sellerAgent);
        assertTrue(a.roles.isAgentFor(seller, sellerAgent, AutorailRoles.Role.Seller));
    }

    function test_isAgent_falseForWrongRoleOrStranger() public view {
        (bool ok,) = a.roles.isAgent(seller, AutorailRoles.Role.Buyer);
        assertFalse(ok);
        (ok,) = a.roles.isAgent(rogue, AutorailRoles.Role.Seller);
        assertFalse(ok);
        assertFalse(a.roles.isAgentFor(seller, sellerAgent, AutorailRoles.Role.Buyer));
        assertFalse(a.roles.isAgentFor(address(0), sellerAgent, AutorailRoles.Role.Seller));
        assertFalse(a.roles.isAgentFor(seller, sellerAgent, AutorailRoles.Role.None));
    }

    function test_isAgent_followsNftTransfer() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(seller);
        a.identity.transferFrom(seller, newOwner, sellerAgent);
        (bool ok, uint256 id) = a.roles.isAgent(seller, AutorailRoles.Role.Seller);
        assertFalse(ok, "old owner lost control");
        assertEq(id, 0);
        assertTrue(
            a.roles.isAgentFor(newOwner, sellerAgent, AutorailRoles.Role.Seller), "new owner controls it"
        );
    }

    function test_setRole_onlyOwner() public {
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, rogue));
        a.roles.setRole(sellerAgent, AutorailRoles.Role.Buyer);
    }

    function test_setRole_rejectsNone() public {
        vm.expectRevert(AutorailRoles.InvalidRole.selector);
        a.roles.setRole(sellerAgent, AutorailRoles.Role.None);
    }

    function test_setRole_rejectsUnknownAgent() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        a.roles.setRole(999, AutorailRoles.Role.Seller);
    }

    function test_setBuyerTier_validation() public {
        vm.expectRevert(abi.encodeWithSelector(AutorailRoles.NotABuyer.selector, sellerAgent));
        a.roles.setBuyerTier(sellerAgent, 1);
        vm.expectRevert(abi.encodeWithSelector(AutorailRoles.InvalidTier.selector, 0));
        a.roles.setBuyerTier(buyerAgent, 0);
        vm.expectRevert(abi.encodeWithSelector(AutorailRoles.InvalidTier.selector, 4));
        a.roles.setBuyerTier(buyerAgent, 4);
        a.roles.setBuyerTier(buyerAgent, 3);
        assertEq(a.roles.buyerTier(buyerAgent), 3);
    }

    function test_ownable2Step() public {
        address next = makeAddr("nextAdmin");
        a.roles.transferOwnership(next);
        assertEq(a.roles.owner(), address(this));
        vm.prank(next);
        a.roles.acceptOwnership();
        assertEq(a.roles.owner(), next);
    }
}
