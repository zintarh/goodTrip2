// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/PlayerRegistry.sol";

contract PlayerRegistryTest is Test {
    PlayerRegistry registry;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        PlayerRegistry impl = new PlayerRegistry();
        registry = PlayerRegistry(
            address(new ERC1967Proxy(
                address(impl),
                abi.encodeCall(PlayerRegistry.initialize, (address(this)))
            ))
        );
    }

    // ── register ───────────────────────────────────────────────────────────────

    function test_register_setsUsernameAndTimestamp() public {
        vm.prank(alice);
        registry.register("alice_gamer");

        (string memory username, uint256 ts) = registry.getPlayer(alice);
        assertEq(username, "alice_gamer");
        assertGt(ts, 0);
    }

    function test_register_updatesLookupMaps() public {
        vm.prank(alice);
        registry.register("alice_gamer");

        assertTrue(registry.isRegistered(alice));
        assertEq(registry.addressOf("alice_gamer"), alice);
    }

    function test_register_emitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit PlayerRegistry.PlayerRegistered(alice, "alice_gamer", block.timestamp);
        registry.register("alice_gamer");
    }

    function test_register_revertAlreadyRegistered() public {
        vm.prank(alice);
        registry.register("alice");

        vm.prank(alice);
        vm.expectRevert(PlayerRegistry.AlreadyRegistered.selector);
        registry.register("alice2");
    }

    function test_register_revertUsernameTaken() public {
        vm.prank(alice);
        registry.register("coolname");

        vm.prank(bob);
        vm.expectRevert(PlayerRegistry.UsernameTaken.selector);
        registry.register("coolname");
    }

    function test_register_revertEmptyUsername() public {
        vm.prank(alice);
        vm.expectRevert(PlayerRegistry.InvalidUsername.selector);
        registry.register("");
    }

    function test_register_revertTooLongUsername() public {
        vm.prank(alice);
        vm.expectRevert(PlayerRegistry.InvalidUsername.selector);
        registry.register("this_username_is_way_too_long_123");
    }

    function test_register_revertInvalidChar() public {
        vm.prank(alice);
        vm.expectRevert(PlayerRegistry.InvalidUsername.selector);
        registry.register("has space");
    }

    function test_register_allowsUnderscoreAndNumbers() public {
        vm.prank(alice);
        registry.register("alice_007");
        assertEq(registry.addressOf("alice_007"), alice);
    }

    // ── updateUsername ─────────────────────────────────────────────────────────

    function test_updateUsername_swapsNames() public {
        vm.prank(alice);
        registry.register("alice_old");

        vm.prank(alice);
        registry.updateUsername("alice_new");

        (string memory username,) = registry.getPlayer(alice);
        assertEq(username, "alice_new");
        assertEq(registry.addressOf("alice_new"), alice);
        assertEq(registry.addressOf("alice_old"), address(0));
    }

    function test_updateUsername_revertNotRegistered() public {
        vm.prank(alice);
        vm.expectRevert(PlayerRegistry.NotRegistered.selector);
        registry.updateUsername("alice");
    }

    function test_updateUsername_revertUsernameTaken() public {
        vm.prank(alice);
        registry.register("alice");

        vm.prank(bob);
        registry.register("bob");

        vm.prank(alice);
        vm.expectRevert(PlayerRegistry.UsernameTaken.selector);
        registry.updateUsername("bob");
    }
}
