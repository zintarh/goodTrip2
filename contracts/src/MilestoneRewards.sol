// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC20.sol";
import "./SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title MilestoneRewards
/// @notice Players claim G$/USDT rewards when they hit all-time score milestones.
///         Backend signs a MilestoneClaim voucher once the threshold is crossed.
///         Owner configures tiers; contract must be funded with reward tokens.
/// @dev UUPS-upgradeable. Deployed behind an ERC1967 proxy; `owner` (OZ Ownable)
///      configures tiers and authorizes upgrades.
contract MilestoneRewards is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    // ── EIP-712 ────────────────────────────────────────────────────────────────
    /// @dev Set once in initialize() against the proxy address + deploy chainId.
    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant MILESTONE_CLAIM_TYPEHASH = keccak256(
        "MilestoneClaim(address player,uint256 tierId)"
    );

    // ── State ──────────────────────────────────────────────────────────────────
    address public backendSigner;

    struct Tier {
        address token;
        uint256 rewardAmount;
        bool    exists;
    }

    mapping(uint256 => Tier)                        public tiers;
    mapping(address => mapping(uint256 => bool))    public claimed;

    // ── Events ─────────────────────────────────────────────────────────────────
    event TierSet(uint256 indexed tierId, address token, uint256 rewardAmount);
    event MilestoneClaimed(address indexed player, uint256 indexed tierId, address token, uint256 amount);

    // ── Errors ─────────────────────────────────────────────────────────────────
    error TierNotFound();
    error AlreadyClaimed();
    error InvalidSignature();
    error InsufficientContractBalance();

    // ── Initializer ────────────────────────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Proxy initializer — runs once, in place of a constructor.
    function initialize(address initialOwner, address _backendSigner) external initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        backendSigner = _backendSigner;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("GoodTrip"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    /// @dev Restricts contract upgrades to the owner.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ── Admin ──────────────────────────────────────────────────────────────────

    /// @notice Define or update a milestone tier.
    /// @param tierId       Arbitrary tier identifier (e.g. 0=bronze 1=silver 2=gold).
    /// @param token        ERC20 token to pay out (G$ or USDT).
    /// @param rewardAmount Amount in token's smallest unit.
    function setTier(uint256 tierId, address token, uint256 rewardAmount) external onlyOwner {
        tiers[tierId] = Tier({ token: token, rewardAmount: rewardAmount, exists: true });
        emit TierSet(tierId, token, rewardAmount);
    }

    // ── External ───────────────────────────────────────────────────────────────

    /// @notice Claim a milestone reward.
    /// @param tierId    Milestone tier the player reached.
    /// @param signature EIP-712 signature from backend proving eligibility.
    function claimMilestone(uint256 tierId, bytes calldata signature) external {
        Tier storage tier = tiers[tierId];
        if (!tier.exists)                  revert TierNotFound();
        if (claimed[msg.sender][tierId])   revert AlreadyClaimed();

        bytes32 structHash = keccak256(abi.encode(MILESTONE_CLAIM_TYPEHASH, msg.sender, tierId));
        bytes32 digest     = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        if (_recover(digest, signature) != backendSigner) revert InvalidSignature();
        if (IERC20(tier.token).balanceOf(address(this)) < tier.rewardAmount)
            revert InsufficientContractBalance();

        claimed[msg.sender][tierId] = true; // mark before transfer (CEI)
        IERC20(tier.token).safeTransfer(msg.sender, tier.rewardAmount);

        emit MilestoneClaimed(msg.sender, tierId, tier.token, tier.rewardAmount);
    }

    // ── View ───────────────────────────────────────────────────────────────────

    function hasClaimed(address player, uint256 tierId) external view returns (bool) {
        return claimed[player][tierId];
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig length");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }

    /// @dev Reserved storage slots for future upgrades.
    uint256[50] private __gap;
}
