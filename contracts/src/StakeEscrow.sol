// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC20.sol";
import "./SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @title StakeEscrow
/// @notice Holds token stakes for GoodTrip invite matches.
///         Backend attests final ranking via EIP-712; winners claim their share.
///         5% rake goes to the treasury.
/// @dev UUPS-upgradeable. Deployed behind an ERC1967 proxy; `owner` authorizes
///      upgrades. NOTE: because this contract custodies staked funds, the upgrade
///      key is a trusted party — a malicious upgrade could move deposited tokens.
contract StakeEscrow is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    // ── EIP-712 ────────────────────────────────────────────────────────────────
    /// @dev Set once in initialize() against the proxy address + deploy chainId.
    bytes32 public DOMAIN_SEPARATOR;

    // Settlement signs (matchId, keccak256(abi.encodePacked(rankedPlayers)))
    bytes32 public constant SETTLEMENT_TYPEHASH = keccak256(
        "MatchSettlement(bytes32 matchId,bytes32 rankedPlayersHash)"
    );

    // ── Constants ──────────────────────────────────────────────────────────────
    uint256 public constant RAKE_BPS = 500;   // 5%
    uint256 public constant BPS      = 10_000;

    // ── Types ──────────────────────────────────────────────────────────────────
    enum SplitType { WINNER_TAKE_ALL, TOP_3, TOP_4 }

    struct Match {
        address token;
        uint256 stakePerPlayer;
        uint8   maxPlayers;
        SplitType splitType;
        uint8   playerCount;
        bool    settled;
    }

    // ── State ──────────────────────────────────────────────────────────────────
    address public backendSigner;
    address public treasury;

    mapping(bytes32 => Match)                          public matches;
    mapping(bytes32 => address[])                      private _matchPlayers;
    mapping(bytes32 => mapping(address => bool))       public hasDeposited;
    mapping(bytes32 => mapping(address => uint256))    public claimable;
    mapping(bytes32 => bool)                           public usedSettlements;

    // ── Events ─────────────────────────────────────────────────────────────────
    event MatchCreated(bytes32 indexed matchId, address token, uint256 stakePerPlayer, uint8 maxPlayers, SplitType splitType);
    event PlayerDeposited(bytes32 indexed matchId, address indexed player);
    event MatchSettled(bytes32 indexed matchId, address[] rankedPlayers);
    event RewardClaimed(bytes32 indexed matchId, address indexed player, uint256 amount);

    // ── Errors ─────────────────────────────────────────────────────────────────
    error MatchExists();
    error MatchNotFound();
    error AlreadyDeposited();
    error MatchFull();
    error AlreadySettled();
    error InvalidSignature();
    error SettlementAlreadyUsed();
    error NothingToClaim();
    error InvalidConfig();

    // ── Reentrancy guard ─────────────────────────────────────────────────────
    // Provided by ReentrancyGuardUpgradeable (its `nonReentrant` modifier and
    // proxy-safe initialization replace the previous manual `_lock` guard, whose
    // inline `= 1` default would not run under the proxy and would brick calls).

    // ── Initializer ────────────────────────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Proxy initializer — runs once, in place of a constructor.
    function initialize(
        address initialOwner,
        address _backendSigner,
        address _treasury
    ) external initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        backendSigner = _backendSigner;
        treasury      = _treasury;
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

    // ── External ───────────────────────────────────────────────────────────────

    /// @notice Match creator registers a new staked match.
    function createMatch(
        bytes32   matchId,
        address   token,
        uint256   stakePerPlayer,
        uint8     maxPlayers,
        SplitType splitType
    ) external {
        if (matches[matchId].maxPlayers != 0) revert MatchExists();
        if (maxPlayers < 2) revert InvalidConfig();
        if (splitType == SplitType.TOP_3 && maxPlayers < 3) revert InvalidConfig();
        if (splitType == SplitType.TOP_4 && maxPlayers < 4) revert InvalidConfig();

        matches[matchId] = Match({
            token:           token,
            stakePerPlayer:  stakePerPlayer,
            maxPlayers:      maxPlayers,
            splitType:       splitType,
            playerCount:     0,
            settled:         false
        });

        emit MatchCreated(matchId, token, stakePerPlayer, maxPlayers, splitType);
    }

    /// @notice Player deposits their stake. Must approve this contract first.
    function deposit(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.maxPlayers == 0)                    revert MatchNotFound();
        if (hasDeposited[matchId][msg.sender])     revert AlreadyDeposited();
        if (m.playerCount >= m.maxPlayers)         revert MatchFull();
        if (m.settled)                             revert AlreadySettled();

        // Effects before interaction (CEI)
        hasDeposited[matchId][msg.sender] = true;
        m.playerCount++;
        _matchPlayers[matchId].push(msg.sender);

        IERC20(m.token).safeTransferFrom(msg.sender, address(this), m.stakePerPlayer);

        emit PlayerDeposited(matchId, msg.sender);
    }

    /// @notice Backend-attested settlement. Distributes prize pool to claimable balances.
    /// @param rankedPlayers Players ordered 1st→last by final score.
    function settle(
        bytes32          matchId,
        address[] calldata rankedPlayers,
        bytes     calldata signature
    ) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.maxPlayers == 0) revert MatchNotFound();
        if (m.settled)         revert AlreadySettled();

        bytes32 rankedHash  = keccak256(abi.encodePacked(rankedPlayers));
        bytes32 structHash  = keccak256(abi.encode(SETTLEMENT_TYPEHASH, matchId, rankedHash));
        bytes32 digest      = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        if (usedSettlements[digest])             revert SettlementAlreadyUsed();
        if (_recover(digest, signature) != backendSigner) revert InvalidSignature();

        usedSettlements[digest] = true;
        m.settled               = true;

        uint256 totalPot   = uint256(m.playerCount) * m.stakePerPlayer;
        uint256 rake       = (totalPot * RAKE_BPS) / BPS;
        uint256 prizePool  = totalPot - rake;

        if (rake > 0) IERC20(m.token).safeTransfer(treasury, rake);

        uint256[] memory shares = _splitShares(m.splitType);
        uint256 len = shares.length < rankedPlayers.length ? shares.length : rankedPlayers.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 payout = (prizePool * shares[i]) / BPS;
            if (payout > 0) claimable[matchId][rankedPlayers[i]] += payout;
        }

        emit MatchSettled(matchId, rankedPlayers);
    }

    /// @notice Winner calls this to receive their prize.
    function claim(bytes32 matchId) external nonReentrant {
        uint256 amount = claimable[matchId][msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimable[matchId][msg.sender] = 0; // zero before transfer (CEI)
        IERC20(matches[matchId].token).safeTransfer(msg.sender, amount);

        emit RewardClaimed(matchId, msg.sender, amount);
    }

    // ── View ───────────────────────────────────────────────────────────────────

    function getPlayers(bytes32 matchId) external view returns (address[] memory) {
        return _matchPlayers[matchId];
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    function _splitShares(SplitType splitType) internal pure returns (uint256[] memory shares) {
        if (splitType == SplitType.WINNER_TAKE_ALL) {
            shares = new uint256[](1);
            shares[0] = 10_000;
        } else if (splitType == SplitType.TOP_3) {
            shares = new uint256[](3);
            shares[0] = 6_000; // 60%
            shares[1] = 3_000; // 30%
            shares[2] = 1_000; // 10%
        } else {
            shares = new uint256[](4);
            shares[0] = 5_000; // 50%
            shares[1] = 2_500; // 25%
            shares[2] = 1_500; // 15%
            shares[3] = 1_000; // 10%
        }
    }

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
