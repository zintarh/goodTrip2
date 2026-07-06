// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../src/ScoreRegistry.sol";

/// A trivial V2 to prove the proxy can be upgraded and keeps its storage.
contract ScoreRegistryV2 is ScoreRegistry {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract UpgradeabilityTest is Test {
    ScoreRegistry registry;
    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    address internal owner = address(this);
    address internal attacker = address(0xBAD);
    address internal player = address(0xBEEF);

    function setUp() public {
        signer = vm.addr(signerKey);
        ScoreRegistry impl = new ScoreRegistry();
        registry = ScoreRegistry(
            address(new ERC1967Proxy(
                address(impl),
                abi.encodeCall(ScoreRegistry.initialize, (owner, signer))
            ))
        );
    }

    function test_ownerAndSignerSet() public view {
        assertEq(registry.owner(), owner);
        assertEq(registry.backendSigner(), signer);
        assertTrue(registry.DOMAIN_SEPARATOR() != bytes32(0));
    }

    function test_revertOn_reinitialize() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        registry.initialize(attacker, attacker);
    }

    function test_revertOn_implementationInitialize() public {
        // The implementation contract itself must have initializers disabled.
        ScoreRegistry impl = new ScoreRegistry();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(attacker, attacker);
    }

    function test_revertOn_nonOwnerUpgrade() public {
        address v2 = address(new ScoreRegistryV2());
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, attacker)
        );
        UUPSUpgradeable(address(registry)).upgradeToAndCall(v2, "");
    }

    function test_ownerUpgrade_preservesState() public {
        // Record a score, then upgrade, and confirm the stored score survives.
        bytes32 gameId = keccak256("game-upgrade");
        uint256 score = 1234;
        bytes32 structHash = keccak256(
            abi.encode(registry.SCORE_ATTESTATION_TYPEHASH(), player, gameId, score)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        vm.prank(player);
        registry.submitScore(gameId, score, abi.encodePacked(r, s, v));

        address v2 = address(new ScoreRegistryV2());
        UUPSUpgradeable(address(registry)).upgradeToAndCall(v2, "");

        assertEq(ScoreRegistryV2(address(registry)).version(), 2);
        assertEq(registry.getScore(player, gameId), score); // storage preserved
        assertEq(registry.owner(), owner);
    }
}
