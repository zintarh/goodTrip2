import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Tracks only what's needed server-side: which locations each address has seen.
  // Profile data (username, scores) lives on-chain in PlayerRegistry / ScoreRegistry.
  players: defineTable({
    address: v.string(),
    seenLocationIds: v.array(v.string()),
    // Daily-play streak — updated whenever a game completes (see convex/streaks.ts).
    currentStreak: v.optional(v.number()),
    longestStreak: v.optional(v.number()),
    lastPlayedDate: v.optional(v.string()), // "YYYY-MM-DD", UTC day
    streakFreezes: v.optional(v.number()),  // banked freezes, purchased with G$
  })
    .index("by_address", ["address"]),

  regions: defineTable({
    name: v.string(),
    countryCode: v.string(),
    locationCount: v.number(),
    coverageThreshold: v.number(),
  }),

  locations: defineTable({
    regionId: v.id("regions"),
    imageUrl: v.string(),
    mapillaryId: v.optional(v.string()),
    placeName: v.string(),
    lat: v.number(),               // NEVER returned to client before guess locked
    lng: v.number(),
    isApproved: v.boolean(),
    rating: v.number(),
    ratingCount: v.number(),
  })
    .index("by_region", ["regionId"]),

  games: defineTable({
    playerAddress: v.string(),
    mode: v.union(v.literal("random"), v.literal("region"), v.literal("invite"), v.literal("staked")),
    regionId: v.optional(v.id("regions")),
    inviteMatchId: v.optional(v.id("invite_matches")),
    totalScore: v.number(),
    isComplete: v.boolean(),
    onChainTxHash: v.optional(v.string()),
  })
    .index("by_player", ["playerAddress"])
    .index("by_invite_match", ["inviteMatchId"]),

  rounds: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    locationId: v.id("locations"),
    guessLat: v.optional(v.number()),
    guessLng: v.optional(v.number()),
    score: v.optional(v.number()),
    distanceKm: v.optional(v.number()),
    isComplete: v.boolean(),
  })
    .index("by_game", ["gameId"]),

  invite_matches: defineTable({
    inviteCode: v.string(),
    creatorAddress: v.string(),
    locationIds: v.array(v.id("locations")),
    stakeAmount: v.optional(v.string()),
    token: v.optional(v.union(v.literal("GD"), v.literal("USDT"))),
    split: v.optional(v.union(v.literal("winner-take-all"), v.literal("top-3"), v.literal("top-4"))),
    playerAddresses: v.array(v.string()),
    isSettled: v.boolean(),
    escrowTxHash: v.optional(v.string()), // creator's StakeEscrow.createMatch tx
    onChainMatchId: v.optional(v.string()), // bytes32 matchId used on StakeEscrow
    rankedPlayers: v.optional(v.array(v.string())), // final settlement order, best first
    settleTxHash: v.optional(v.string()),
  })
    .index("by_code", ["inviteCode"]),

  // Per-player StakeEscrow.deposit tx receipts for a staked invite match.
  escrow_deposits: defineTable({
    inviteMatchId: v.id("invite_matches"),
    playerAddress: v.string(),
    txHash: v.string(),
  })
    .index("by_match", ["inviteMatchId"]),

  hints_log: defineTable({
    playerAddress: v.string(),
    roundId: v.id("rounds"),
    hintType: v.union(
      v.literal("region-reveal"),
      v.literal("area-narrow"),
      v.literal("place-clue")
    ),
    costGD: v.string(),
    txHash: v.optional(v.string()), // verified on-chain G$ transfer where present — see convex/lib/verifyPayment.ts. Optional to tolerate rows written before this check existed.
  })
    .index("by_player", ["playerAddress"])
    .index("by_tx_hash", ["txHash"]),

  streak_freeze_purchases: defineTable({
    playerAddress: v.string(),
    costGD: v.string(),
    txHash: v.optional(v.string()), // verified on-chain G$ transfer where present — see convex/lib/verifyPayment.ts. Optional to tolerate rows written before this check existed.
  })
    .index("by_player", ["playerAddress"])
    .index("by_tx_hash", ["txHash"]),
});
