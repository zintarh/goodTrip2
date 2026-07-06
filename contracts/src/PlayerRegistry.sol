// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title PlayerRegistry
/// @notice On-chain player profiles for GoodTrip.
///         Every wallet that wants to play must register once.
///         All events are queryable on Dune / Goldsky.
/// @dev UUPS-upgradeable. Deployed behind an ERC1967 proxy; `owner` authorizes upgrades.
contract PlayerRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    struct Player {
        string username;
        uint256 registeredAt;
    }

    mapping(address => Player) private _players;
    mapping(string => address) private _usernameOwner;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Proxy initializer — runs once, in place of a constructor.
    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
    }

    /// @dev Restricts contract upgrades to the owner.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ── Events (indexed for Dune / Goldsky) ───────────────────────────────────
    event PlayerRegistered(address indexed player, string username, uint256 timestamp);
    event UsernameUpdated(address indexed player, string oldUsername, string newUsername);

    // ── Errors ─────────────────────────────────────────────────────────────────
    error AlreadyRegistered();
    error UsernameTaken();
    error NotRegistered();
    error InvalidUsername();

    // ── External ───────────────────────────────────────────────────────────────

    /// @notice Register a new player. Reverts if address already registered or username taken.
    function register(string calldata username) external {
        if (_players[msg.sender].registeredAt != 0) revert AlreadyRegistered();
        _validateUsername(username);
        if (_usernameOwner[username] != address(0)) revert UsernameTaken();

        _players[msg.sender] = Player({ username: username, registeredAt: block.timestamp });
        _usernameOwner[username] = msg.sender;

        emit PlayerRegistered(msg.sender, username, block.timestamp);
    }

    /// @notice Change username. Old username is freed immediately.
    function updateUsername(string calldata newUsername) external {
        if (_players[msg.sender].registeredAt == 0) revert NotRegistered();
        _validateUsername(newUsername);
        if (_usernameOwner[newUsername] != address(0)) revert UsernameTaken();

        string memory old = _players[msg.sender].username;
        delete _usernameOwner[old];
        _players[msg.sender].username = newUsername;
        _usernameOwner[newUsername] = msg.sender;

        emit UsernameUpdated(msg.sender, old, newUsername);
    }

    // ── View ───────────────────────────────────────────────────────────────────

    function getPlayer(address addr) external view returns (string memory username, uint256 registeredAt) {
        Player storage p = _players[addr];
        return (p.username, p.registeredAt);
    }

    function isRegistered(address addr) external view returns (bool) {
        return _players[addr].registeredAt != 0;
    }

    function addressOf(string calldata username) external view returns (address) {
        return _usernameOwner[username];
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    /// @dev 1–32 chars, alphanumeric + underscore only.
    function _validateUsername(string calldata username) internal pure {
        uint256 len = bytes(username).length;
        if (len == 0 || len > 32) revert InvalidUsername();
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = bytes(username)[i];
            bool ok = (c >= 0x30 && c <= 0x39) // 0-9
                   || (c >= 0x41 && c <= 0x5A)  // A-Z
                   || (c >= 0x61 && c <= 0x7A)  // a-z
                   || c == 0x5F;                 // _
            if (!ok) revert InvalidUsername();
        }
    }

    /// @dev Reserved storage slots so future upgrades can add state without
    ///      colliding with inheriting/child layout.
    uint256[50] private __gap;
}
