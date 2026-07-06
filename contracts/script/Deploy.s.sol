// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/PlayerRegistry.sol";
import "../src/ScoreRegistry.sol";
import "../src/StakeEscrow.sol";
import "../src/MilestoneRewards.sol";

/// @notice Deploys each contract as a UUPS implementation behind an ERC1967
///         proxy. The proxy address is the stable, user-facing address that goes
///         into the app / Convex / subgraph; the implementation can be swapped
///         later via `upgradeToAndCall` (owner-gated by `_authorizeUpgrade`).
contract Deploy is Script {
    function run() external {
        // Two separate signers, matching two separate Convex signing keys
        // (CONVEX_BACKEND_SIGNING_KEY / CONVEX_SETTLEMENT_SIGNING_KEY): scores
        // are high-frequency/low-value per-round attestations, while
        // settlement/milestones move real pooled funds. Splitting them means a
        // leaked scores key can't authorize a payout.
        address scoreBackendSigner      = vm.envAddress("SCORE_BACKEND_SIGNER");
        address settlementBackendSigner = vm.envAddress("SETTLEMENT_BACKEND_SIGNER");
        address treasury                = vm.envAddress("TREASURY_ADDRESS");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner       = vm.addr(deployerKey); // upgrade admin = deployer EOA

        vm.startBroadcast(deployerKey);

        address playerRegistry = _deployProxy(
            address(new PlayerRegistry()),
            abi.encodeCall(PlayerRegistry.initialize, (owner))
        );
        address scoreRegistry = _deployProxy(
            address(new ScoreRegistry()),
            abi.encodeCall(ScoreRegistry.initialize, (owner, scoreBackendSigner))
        );
        address stakeEscrow = _deployProxy(
            address(new StakeEscrow()),
            abi.encodeCall(StakeEscrow.initialize, (owner, settlementBackendSigner, treasury))
        );
        address milestoneRewards = _deployProxy(
            address(new MilestoneRewards()),
            abi.encodeCall(MilestoneRewards.initialize, (owner, settlementBackendSigner))
        );

        vm.stopBroadcast();

        console.log("Upgrade owner:    ", owner);
        console.log("PlayerRegistry:   ", playerRegistry);
        console.log("ScoreRegistry:    ", scoreRegistry);
        console.log("StakeEscrow:      ", stakeEscrow);
        console.log("MilestoneRewards: ", milestoneRewards);
        console.log("");
        console.log("Add to apps/web/.env.local:");
        console.log("NEXT_PUBLIC_PLAYER_REGISTRY_ADDRESS=", playerRegistry);
        console.log("NEXT_PUBLIC_SCORE_REGISTRY_ADDRESS=",  scoreRegistry);
        console.log("NEXT_PUBLIC_STAKE_ESCROW_ADDRESS=",    stakeEscrow);
        console.log("NEXT_PUBLIC_MILESTONE_REWARDS_ADDRESS=", milestoneRewards);
    }

    function _deployProxy(address impl, bytes memory initData) internal returns (address) {
        return address(new ERC1967Proxy(impl, initData));
    }
}
