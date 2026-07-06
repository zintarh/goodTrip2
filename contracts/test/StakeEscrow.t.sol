// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/StakeEscrow.sol";
import "../src/IERC20.sol";

// Minimal mock — just enough of ERC20 for StakeEscrow's transferFrom/transfer calls.
contract MockERC20 is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract StakeEscrowTest is Test {
    StakeEscrow public escrow;
    MockERC20 public token;

    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    address internal treasury = address(0x7EA5);
    address internal alice = address(0xA11CE0);
    address internal bob = address(0xB0B0);

    uint256 internal constant STAKE = 100e18;

    function setUp() public {
        signer = vm.addr(signerKey);
        StakeEscrow impl = new StakeEscrow();
        escrow = StakeEscrow(
            address(new ERC1967Proxy(
                address(impl),
                abi.encodeCall(StakeEscrow.initialize, (address(this), signer, treasury))
            ))
        );
        token = new MockERC20();

        token.mint(alice, 1000e18);
        token.mint(bob, 1000e18);
    }

    function _makeMatchId(string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(label));
    }

    function _createMatch(bytes32 matchId, uint8 maxPlayers, StakeEscrow.SplitType splitType) internal {
        escrow.createMatch(matchId, address(token), STAKE, maxPlayers, splitType);
    }

    function _deposit(address player, bytes32 matchId) internal {
        vm.startPrank(player);
        token.approve(address(escrow), STAKE);
        escrow.deposit(matchId);
        vm.stopPrank();
    }

    function _settlementDigest(bytes32 matchId, address[] memory rankedPlayers) internal view returns (bytes32) {
        bytes32 rankedHash = keccak256(abi.encodePacked(rankedPlayers));
        bytes32 structHash = keccak256(abi.encode(escrow.SETTLEMENT_TYPEHASH(), matchId, rankedHash));
        return keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));
    }

    function _signSettlement(bytes32 digest) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _twoPlayerRanking() internal view returns (address[] memory ranked) {
        ranked = new address[](2);
        ranked[0] = alice;
        ranked[1] = bob;
    }

    // ── createMatch ──────────────────────────────────────────────────────────

    function test_createMatch_emitsEvent() public {
        bytes32 matchId = _makeMatchId("match-1");
        vm.expectEmit(true, false, false, true);
        emit StakeEscrow.MatchCreated(matchId, address(token), STAKE, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
    }

    function test_revertOn_createMatch_alreadyExists() public {
        bytes32 matchId = _makeMatchId("match-dup");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        vm.expectRevert(StakeEscrow.MatchExists.selector);
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
    }

    function test_revertOn_createMatch_invalidConfig() public {
        // Top-3 split requires at least 3 max players
        vm.expectRevert(StakeEscrow.InvalidConfig.selector);
        _createMatch(_makeMatchId("match-bad-split"), 2, StakeEscrow.SplitType.TOP_3);
    }

    // ── deposit ──────────────────────────────────────────────────────────────

    function test_deposit_pullsTokens() public {
        bytes32 matchId = _makeMatchId("match-2");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        assertEq(token.balanceOf(address(escrow)), STAKE);
        assertTrue(escrow.hasDeposited(matchId, alice));
    }

    function test_revertOn_deposit_alreadyDeposited() public {
        bytes32 matchId = _makeMatchId("match-3");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);

        vm.startPrank(alice);
        token.approve(address(escrow), STAKE);
        vm.expectRevert(StakeEscrow.AlreadyDeposited.selector);
        escrow.deposit(matchId);
        vm.stopPrank();
    }

    function test_revertOn_deposit_matchFull() public {
        // maxPlayers must be >= 2 (InvalidConfig otherwise), so fill a 2-player
        // match and confirm a third depositor is rejected as full.
        bytes32 matchId = _makeMatchId("match-4");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        _deposit(bob, matchId);

        address carol = address(0xCA502);
        token.mint(carol, 1000e18);
        vm.startPrank(carol);
        token.approve(address(escrow), STAKE);
        vm.expectRevert(StakeEscrow.MatchFull.selector);
        escrow.deposit(matchId);
        vm.stopPrank();
    }

    function test_revertOn_deposit_matchNotFound() public {
        vm.startPrank(alice);
        token.approve(address(escrow), STAKE);
        vm.expectRevert(StakeEscrow.MatchNotFound.selector);
        escrow.deposit(_makeMatchId("nonexistent"));
        vm.stopPrank();
    }

    // ── settle ───────────────────────────────────────────────────────────────

    function test_settle_winnerTakeAll_rakeAndPayout() public {
        bytes32 matchId = _makeMatchId("match-5");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        _deposit(bob, matchId);

        address[] memory ranked = _twoPlayerRanking();
        bytes memory sig = _signSettlement(_settlementDigest(matchId, ranked));
        escrow.settle(matchId, ranked, sig);

        uint256 totalPot = STAKE * 2;
        uint256 rake = (totalPot * escrow.RAKE_BPS()) / escrow.BPS();
        uint256 prizePool = totalPot - rake;

        assertEq(token.balanceOf(treasury), rake);
        assertEq(escrow.claimable(matchId, alice), prizePool);
        assertEq(escrow.claimable(matchId, bob), 0);
    }

    function test_revertOn_settle_replayed() public {
        bytes32 matchId = _makeMatchId("match-6");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        _deposit(bob, matchId);

        address[] memory ranked = _twoPlayerRanking();
        bytes memory sig = _signSettlement(_settlementDigest(matchId, ranked));
        escrow.settle(matchId, ranked, sig);

        vm.expectRevert(StakeEscrow.AlreadySettled.selector);
        escrow.settle(matchId, ranked, sig);
    }

    function test_revertOn_settle_invalidSignature() public {
        bytes32 matchId = _makeMatchId("match-7");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        _deposit(bob, matchId);

        address[] memory ranked = _twoPlayerRanking();

        uint256 wrongKey = 0xBAD;
        bytes32 digest = _settlementDigest(matchId, ranked);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert(StakeEscrow.InvalidSignature.selector);
        escrow.settle(matchId, ranked, badSig);
    }

    function test_revertOn_deposit_settledMatch() public {
        bytes32 matchId = _makeMatchId("match-settled-deposit");
        _createMatch(matchId, 3, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        _deposit(bob, matchId);

        address[] memory ranked = _twoPlayerRanking();
        bytes memory sig = _signSettlement(_settlementDigest(matchId, ranked));
        escrow.settle(matchId, ranked, sig);

        address carol = address(0xCA501);
        token.mint(carol, 1000e18);
        vm.startPrank(carol);
        token.approve(address(escrow), STAKE);
        vm.expectRevert(StakeEscrow.AlreadySettled.selector);
        escrow.deposit(matchId);
        vm.stopPrank();
    }

    // ── claim ────────────────────────────────────────────────────────────────

    function test_claim_paysWinner_andZeroesBeforeTransfer() public {
        bytes32 matchId = _makeMatchId("match-8");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        _deposit(bob, matchId);

        address[] memory ranked = _twoPlayerRanking();
        bytes memory sig = _signSettlement(_settlementDigest(matchId, ranked));
        escrow.settle(matchId, ranked, sig);

        uint256 balBefore = token.balanceOf(alice);
        uint256 claimableBefore = escrow.claimable(matchId, alice);

        vm.prank(alice);
        escrow.claim(matchId);

        assertEq(token.balanceOf(alice), balBefore + claimableBefore);
        assertEq(escrow.claimable(matchId, alice), 0);
    }

    function test_revertOn_claim_nothingToClaim() public {
        bytes32 matchId = _makeMatchId("match-9");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        _deposit(bob, matchId);

        vm.expectRevert(StakeEscrow.NothingToClaim.selector);
        vm.prank(alice);
        escrow.claim(matchId);
    }

    function test_revertOn_claim_secondClaim() public {
        bytes32 matchId = _makeMatchId("match-10");
        _createMatch(matchId, 2, StakeEscrow.SplitType.WINNER_TAKE_ALL);
        _deposit(alice, matchId);
        _deposit(bob, matchId);

        address[] memory ranked = _twoPlayerRanking();
        bytes memory sig = _signSettlement(_settlementDigest(matchId, ranked));
        escrow.settle(matchId, ranked, sig);

        vm.prank(alice);
        escrow.claim(matchId);

        vm.expectRevert(StakeEscrow.NothingToClaim.selector);
        vm.prank(alice);
        escrow.claim(matchId);
    }
}
