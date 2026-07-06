import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Shared by the public status query and the internal settlement-voucher query
// so both agree on exactly which game counts as "the" player's result.
async function getMatchPlayerStatuses(ctx: QueryCtx, inviteMatchId: Id<"invite_matches">) {
  const match = await ctx.db.get(inviteMatchId);
  if (!match) return null;

  const players = await Promise.all(
    match.playerAddresses.map(async (address) => {
      const games = await ctx.db
        .query("games")
        .withIndex("by_invite_match", (q) => q.eq("inviteMatchId", inviteMatchId))
        .filter((q) => q.eq(q.field("playerAddress"), address))
        .collect();
      // SECURITY: the EARLIEST game is authoritative, never the most recent.
      // submitGuess reveals each answer's coordinates, and an invite match's 5
      // locations are fixed, so honoring a later game would let a player replay
      // the same match to memorize the answers and then ace it for the pot.
      // createGameFromInviteMatch is also idempotent, but pinning to the first
      // completed attempt is the durable guarantee.
      const game = games.sort((a, b) => a._creationTime - b._creationTime)[0];
      return {
        address,
        isComplete: game?.isComplete ?? false,
        totalScore: game?.totalScore ?? 0,
      };
    })
  );

  return { match, players, allComplete: players.every((p) => p.isComplete) };
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)

function randomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export const createInviteMatch = mutation({
  args: {
    creatorAddress: v.string(),
    stakeAmount: v.optional(v.string()),
    token: v.optional(v.union(v.literal("GD"), v.literal("USDT"))),
    split: v.optional(v.union(v.literal("winner-take-all"), v.literal("top-3"), v.literal("top-4"))),
  },
  handler: async (ctx, { creatorAddress, stakeAmount, token, split }) => {
    const candidates = await ctx.db.query("locations").filter((q) => q.eq(q.field("isApproved"), true)).collect();
    if (candidates.length < 5) throw new Error("Not enough locations available yet");
    const locationIds = candidates.sort(() => Math.random() - 0.5).slice(0, 5).map((l) => l._id);

    let inviteCode = randomCode();
    for (let i = 0; i < 5; i++) {
      const existing = await ctx.db.query("invite_matches").withIndex("by_code", (q) => q.eq("inviteCode", inviteCode)).unique();
      if (!existing) break;
      inviteCode = randomCode();
    }

    const id = await ctx.db.insert("invite_matches", {
      inviteCode,
      creatorAddress,
      locationIds,
      stakeAmount,
      token,
      split,
      playerAddresses: [creatorAddress],
      isSettled: false,
    });
    return { id, inviteCode };
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx): Promise<Doc<"invite_matches">[]> => {
    const matches = await ctx.db.query("invite_matches").filter((q) => q.eq(q.field("isSettled"), false)).collect();
    return matches.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const getByCode = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    return ctx.db.query("invite_matches").withIndex("by_code", (q) => q.eq("inviteCode", inviteCode)).unique();
  },
});

export const join = mutation({
  args: { inviteCode: v.string(), playerAddress: v.string() },
  handler: async (ctx, { inviteCode, playerAddress }) => {
    const match = await ctx.db.query("invite_matches").withIndex("by_code", (q) => q.eq("inviteCode", inviteCode)).unique();
    if (!match) throw new Error("Game not found — check the code and try again.");
    if (match.isSettled) throw new Error("This game has already finished.");
    if (!match.playerAddresses.includes(playerAddress)) {
      await ctx.db.patch(match._id, { playerAddresses: [...match.playerAddresses, playerAddress] });
    }
    return match._id;
  },
});

// Creator deletes a game they host. Staked games can't be deleted — the
// creator's own stake (and any other player's) would be permanently stuck,
// since StakeEscrow has no cancel/refund path.
export const deleteMatch = mutation({
  args: { inviteMatchId: v.id("invite_matches"), requesterAddress: v.string() },
  handler: async (ctx, { inviteMatchId, requesterAddress }) => {
    const match = await ctx.db.get(inviteMatchId);
    if (!match) throw new Error("Game not found.");
    if (match.creatorAddress !== requesterAddress) throw new Error("Only the host can delete this game.");
    if (match.stakeAmount) throw new Error("Staked games can't be deleted — stakes are locked in escrow.");
    await ctx.db.delete(inviteMatchId);
  },
});

// A joined player leaves a game. The host should delete the game instead of
// leaving it. Staked games can't be left — the player's stake would be
// permanently stuck, since StakeEscrow has no cancel/refund path.
export const leaveMatch = mutation({
  args: { inviteMatchId: v.id("invite_matches"), playerAddress: v.string() },
  handler: async (ctx, { inviteMatchId, playerAddress }) => {
    const match = await ctx.db.get(inviteMatchId);
    if (!match) throw new Error("Game not found.");
    if (match.creatorAddress === playerAddress) throw new Error("The host can't leave — delete the game instead.");
    if (match.stakeAmount) throw new Error("Staked games can't be left — your stake is locked in escrow.");
    await ctx.db.patch(inviteMatchId, {
      playerAddresses: match.playerAddresses.filter((a) => a !== playerAddress),
    });
  },
});

// Records the creator's StakeEscrow.createMatch transaction, right after it confirms.
export const recordOnChainMatch = mutation({
  args: {
    inviteMatchId: v.id("invite_matches"),
    onChainMatchId: v.string(),
    txHash: v.string(),
  },
  handler: async (ctx, { inviteMatchId, onChainMatchId, txHash }) => {
    await ctx.db.patch(inviteMatchId, { onChainMatchId, escrowTxHash: txHash });
  },
});

// Records a player's StakeEscrow.deposit transaction. Called after the deposit
// confirms on-chain, and before the player is added via `join`.
export const recordDeposit = mutation({
  args: {
    inviteMatchId: v.id("invite_matches"),
    playerAddress: v.string(),
    txHash: v.string(),
  },
  handler: async (ctx, { inviteMatchId, playerAddress, txHash }) => {
    await ctx.db.insert("escrow_deposits", { inviteMatchId, playerAddress, txHash });
  },
});

// Public — drives the "waiting on N more players" / "ready to settle" UI.
export const getMatchCompletionStatus = query({
  args: { inviteMatchId: v.id("invite_matches") },
  handler: async (ctx, { inviteMatchId }) => {
    const result = await getMatchPlayerStatuses(ctx, inviteMatchId);
    if (!result) throw new Error("Game not found.");
    return { players: result.players, allComplete: result.allComplete };
  },
});

// Internal — used by the settlement-voucher signing action to validate and rank.
export const getMatchForSettlement = internalQuery({
  args: { inviteMatchId: v.id("invite_matches") },
  handler: async (ctx, { inviteMatchId }) => {
    return getMatchPlayerStatuses(ctx, inviteMatchId);
  },
});

// Records a completed on-chain StakeEscrow.settle() call.
export const recordSettlement = mutation({
  args: {
    inviteMatchId: v.id("invite_matches"),
    rankedPlayers: v.array(v.string()),
    txHash: v.string(),
  },
  handler: async (ctx, { inviteMatchId, rankedPlayers, txHash }) => {
    await ctx.db.patch(inviteMatchId, { isSettled: true, rankedPlayers, settleTxHash: txHash });
  },
});
