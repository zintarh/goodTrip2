// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/ScoreRegistry.sol";

contract ScoreRegistryTest is Test {
    ScoreRegistry public registry;

    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    address internal player = address(0xBEEF);

    function setUp() public {
        signer = vm.addr(signerKey);
        ScoreRegistry impl = new ScoreRegistry();
        registry = ScoreRegistry(
            address(new ERC1967Proxy(
                address(impl),
                abi.encodeCall(ScoreRegistry.initialize, (address(this), signer))
            ))
        );
    }

    function _makeDigest(address _player, bytes32 gameId, uint256 score)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(registry.SCORE_ATTESTATION_TYPEHASH(), _player, gameId, score)
        );
        return keccak256(abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash));
    }

    function _sign(bytes32 digest) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_submitScore_valid() public {
        bytes32 gameId = keccak256("game-1");
        uint256 score = 2350;

        bytes32 digest = _makeDigest(player, gameId, score);
        bytes memory sig = _sign(digest);

        vm.prank(player);
        registry.submitScore(gameId, score, sig);

        assertEq(registry.getScore(player, gameId), score);
    }

    function test_revertOn_replayedVoucher() public {
        bytes32 gameId = keccak256("game-2");
        uint256 score = 1000;
        bytes memory sig = _sign(_makeDigest(player, gameId, score));

        vm.prank(player);
        registry.submitScore(gameId, score, sig);

        // Second submit with same voucher must revert
        vm.expectRevert(ScoreRegistry.VoucherAlreadyUsed.selector);
        vm.prank(player);
        registry.submitScore(gameId, score, sig);
    }

    function test_revertOn_invalidSignature() public {
        bytes32 gameId = keccak256("game-3");
        uint256 score = 500;

        // Sign with a different key
        uint256 wrongKey = 0xBAD;
        bytes32 digest = _makeDigest(player, gameId, score);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert(ScoreRegistry.InvalidSignature.selector);
        vm.prank(player);
        registry.submitScore(gameId, score, badSig);
    }

    function test_revertOn_duplicateGame() public {
        bytes32 gameId = keccak256("game-4");
        uint256 score = 1500;
        bytes memory sig = _sign(_makeDigest(player, gameId, score));

        vm.prank(player);
        registry.submitScore(gameId, score, sig);

        // Try again with a fresh (different) voucher for the same gameId
        bytes32 digest2 = _makeDigest(player, gameId, 999);
        bytes memory sig2 = _sign(digest2);

        vm.expectRevert(ScoreRegistry.GameAlreadyRecorded.selector);
        vm.prank(player);
        registry.submitScore(gameId, 999, sig2);
    }
}
