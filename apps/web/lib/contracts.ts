// Contract ABIs — minimal slices the frontend actually calls.
// Full ABI artifacts are in contracts/out/ after `forge build`.

export const PLAYER_REGISTRY_ABI = [
  {
    inputs: [{ name: "username", type: "string" }],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "newUsername", type: "string" }],
    name: "updateUsername",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "addr", type: "address" }],
    name: "isRegistered",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "addr", type: "address" }],
    name: "getPlayer",
    outputs: [
      { name: "username",     type: "string"  },
      { name: "registeredAt", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "player",    type: "address" },
      { indexed: false, name: "username",  type: "string"  },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
    name: "PlayerRegistered",
    type: "event",
  },
] as const;

export const SCORE_REGISTRY_ABI = [
  {
    inputs: [
      { name: "gameId",     type: "bytes32" },
      { name: "totalScore", type: "uint256" },
      { name: "signature",  type: "bytes"   },
    ],
    name: "submitScore",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "player", type: "address" },
      { name: "gameId", type: "bytes32" },
    ],
    name: "getScore",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "player",     type: "address" },
      { indexed: true,  name: "gameId",     type: "bytes32" },
      { indexed: false, name: "score",      type: "uint256" },
    ],
    name: "ScoreRecorded",
    type: "event",
  },
] as const;

export const STAKE_ESCROW_ABI = [
  {
    inputs: [
      { name: "matchId",        type: "bytes32" },
      { name: "token",          type: "address" },
      { name: "stakePerPlayer", type: "uint256" },
      { name: "maxPlayers",     type: "uint8"   },
      { name: "splitType",      type: "uint8"   },
    ],
    name: "createMatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "matchId", type: "bytes32" }],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "matchId", type: "bytes32" }],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "matchId",       type: "bytes32" },
      { name: "rankedPlayers", type: "address[]" },
      { name: "signature",     type: "bytes" },
    ],
    name: "settle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    name: "claimable",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "matchId",   type: "bytes32" },
      { indexed: true,  name: "player",    type: "address" },
      { indexed: false, name: "amount",    type: "uint256" },
    ],
    name: "RewardClaimed",
    type: "event",
  },
] as const;

export const MILESTONE_REWARDS_ABI = [
  {
    inputs: [
      { name: "tierId",    type: "uint256" },
      { name: "signature", type: "bytes"   },
    ],
    name: "claimMilestone",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "player", type: "address" },
      { name: "tierId", type: "uint256" },
    ],
    name: "hasClaimed",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "player", type: "address" },
      { indexed: true,  name: "tierId", type: "uint256" },
      { indexed: false, name: "token",  type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "MilestoneClaimed",
    type: "event",
  },
] as const;

export function getContractAddresses() {
  return {
    playerRegistry:   process.env.NEXT_PUBLIC_PLAYER_REGISTRY_ADDRESS   as `0x${string}` | undefined,
    scoreRegistry:    process.env.NEXT_PUBLIC_SCORE_REGISTRY_ADDRESS    as `0x${string}` | undefined,
    stakeEscrow:      process.env.NEXT_PUBLIC_STAKE_ESCROW_ADDRESS      as `0x${string}` | undefined,
    milestoneRewards: process.env.NEXT_PUBLIC_MILESTONE_REWARDS_ADDRESS as `0x${string}` | undefined,
  };
}
