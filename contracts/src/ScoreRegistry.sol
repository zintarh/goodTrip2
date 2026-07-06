// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title ScoreRegistry
/// @notice Records GoodTrip game scores attested by the off-chain backend signer.
///         Players call submitScore() carrying a server-signed EIP-712 voucher.
/// @dev UUPS-upgradeable. Deployed behind an ERC1967 proxy; `owner` authorizes upgrades.
contract ScoreRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    // ── EIP-712 ────────────────────────────────────────────────────────────────

    /// @dev Set once in initialize() against the proxy address + deploy chainId.
    ///      (No longer immutable — that's incompatible with the proxy pattern.)
    bytes32 public DOMAIN_SEPARATOR;

    bytes32 public constant SCORE_ATTESTATION_TYPEHASH = keccak256(
        "ScoreAttestation(address player,bytes32 gameId,uint256 totalScore)"
    );

    // ── State ──────────────────────────────────────────────────────────────────

    address public backendSigner;

    /// @notice player → gameId → score (0 = not played)
    mapping(address => mapping(bytes32 => uint256)) public scores;

    /// @notice prevents replay of the same voucher
    mapping(bytes32 => bool) public usedVouchers;

    // ── Events ─────────────────────────────────────────────────────────────────

    event ScoreRecorded(address indexed player, bytes32 indexed gameId, uint256 score);

    // ── Errors ─────────────────────────────────────────────────────────────────

    error InvalidSignature();
    error VoucherAlreadyUsed();
    error GameAlreadyRecorded();

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
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("GoodTrip"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @dev Restricts contract upgrades to the owner.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ── External ───────────────────────────────────────────────────────────────

    /// @notice Submit a server-attested score on-chain.
    /// @param gameId    Off-chain game identifier (keccak256 of the Convex game _id).
    /// @param totalScore Score for this game (0–2500).
    /// @param signature  EIP-712 signature from the backend signer.
    function submitScore(bytes32 gameId, uint256 totalScore, bytes calldata signature) external {
        bytes32 structHash = keccak256(
            abi.encode(SCORE_ATTESTATION_TYPEHASH, msg.sender, gameId, totalScore)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        // Voucher replay check runs before game-recorded check so the error is meaningful
        if (usedVouchers[digest]) revert VoucherAlreadyUsed();
        if (scores[msg.sender][gameId] != 0) revert GameAlreadyRecorded();

        address recovered = _recover(digest, signature);
        if (recovered != backendSigner) revert InvalidSignature();

        usedVouchers[digest] = true;
        scores[msg.sender][gameId] = totalScore;

        emit ScoreRecorded(msg.sender, gameId, totalScore);
    }

    /// @notice Read a player's score for a given game (0 = unrecorded).
    function getScore(address player, bytes32 gameId) external view returns (uint256) {
        return scores[player][gameId];
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
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
