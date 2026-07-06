import { mutation, query, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { applyStreakUpdate } from "./streaks";

const DISTANCE_CONSTANT_WORLD  = 2000;
const DISTANCE_CONSTANT_REGION = 200;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcScore(distanceKm: number, D: number): number {
  return Math.round(500 * Math.exp(-distanceKm / D));
}

export const createGame = mutation({
  args: {
    playerAddress: v.string(),
    mode: v.union(v.literal("random"), v.literal("region"), v.literal("invite"), v.literal("staked")),
    regionId: v.optional(v.id("regions")),
  },
  handler: async (ctx, { playerAddress, mode, regionId }) => {
    // Upsert player row (only used for anti-farming seenLocationIds)
    let player = await ctx.db
      .query("players")
      .withIndex("by_address", (q) => q.eq("address", playerAddress))
      .unique();
    if (!player) {
      const id = await ctx.db.insert("players", { address: playerAddress, seenLocationIds: [] });
      player = await ctx.db.get(id);
    }

    const seen = new Set(player!.seenLocationIds);
    let candidates = await ctx.db
      .query("locations")
      .filter((q) => q.eq(q.field("isApproved"), true))
      .collect();

    if (regionId) {
      candidates = candidates.filter((l) => l.regionId === regionId);
    }

    const unseen = candidates.filter((l) => !seen.has(l._id));
    // Prefer fresh locations, but top up with previously-seen ones rather than
    // blocking play entirely once a player has exhausted a small location pool.
    // Recycle the least-recently-seen ones first (seenLocationIds is oldest-first)
    // so a repeat is never the location they *just* played.
    let pool = unseen;
    if (pool.length < 5) {
      const seenOrder = player!.seenLocationIds;
      const seenCandidates = candidates
        .filter((l) => seen.has(l._id))
        .sort((a, b) => seenOrder.indexOf(a._id) - seenOrder.indexOf(b._id));
      // Only pull as many recycled locations as needed to reach 5 — otherwise the
      // shuffle below would give a just-seen location the same odds as one seen ages ago.
      pool = [...unseen, ...seenCandidates.slice(0, 5 - unseen.length)];
    }
    if (pool.length < 5) throw new Error("Not enough locations available yet — ask an admin to import more.");

    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 5);

    const gameId = await ctx.db.insert("games", {
      playerAddress,
      mode,
      regionId,
      totalScore: 0,
      isComplete: false,
    });

    for (let i = 0; i < shuffled.length; i++) {
      await ctx.db.insert("rounds", {
        gameId,
        roundNumber: i + 1,
        locationId: shuffled[i]._id,
        isComplete: false,
      });
    }

    return gameId;
  },
});

// Starts a game using an invite match's fixed 5 locations (shared by every
// player in that match, unlike "random" mode's per-player unseen selection).
export const createGameFromInviteMatch = mutation({
  args: {
    inviteMatchId: v.id("invite_matches"),
    playerAddress: v.string(),
  },
  handler: async (ctx, { inviteMatchId, playerAddress }) => {
    const match = await ctx.db.get(inviteMatchId);
    if (!match) throw new Error("Game not found");

    // SECURITY / idempotency: one game per player per invite match. Without
    // this, a player could finish once (seeing all 5 answers, which submitGuess
    // reveals), then start a fresh game for the same fixed locations and enter
    // the exact coordinates for a perfect score — cheating a staked pot and the
    // leaderboard. Reuse the existing game (earliest) instead of making a new one.
    const existing = await ctx.db
      .query("games")
      .withIndex("by_invite_match", (q) => q.eq("inviteMatchId", inviteMatchId))
      .filter((q) => q.eq(q.field("playerAddress"), playerAddress))
      .collect();
    if (existing.length > 0) {
      return existing.sort((a, b) => a._creationTime - b._creationTime)[0]._id;
    }

    const gameId = await ctx.db.insert("games", {
      playerAddress,
      mode: "invite",
      inviteMatchId,
      totalScore: 0,
      isComplete: false,
    });

    for (let i = 0; i < match.locationIds.length; i++) {
      await ctx.db.insert("rounds", {
        gameId,
        roundNumber: i + 1,
        locationId: match.locationIds[i],
        isComplete: false,
      });
    }

    return gameId;
  },
});

export const submitGuess = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    guessLat: v.number(),
    guessLng: v.number(),
  },
  handler: async (ctx, { gameId, roundNumber, guessLat, guessLng }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.isComplete) throw new Error("Invalid or completed game");

    const round = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("roundNumber"), roundNumber))
      .unique();
    if (!round || round.isComplete) throw new Error("Invalid or completed round");

    const location = await ctx.db.get(round.locationId);
    if (!location) throw new Error("Location not found");

    const D = game.regionId ? DISTANCE_CONSTANT_REGION : DISTANCE_CONSTANT_WORLD;
    const distanceKm = haversineKm(guessLat, guessLng, location.lat, location.lng);
    const score = calcScore(distanceKm, D);

    await ctx.db.patch(round._id, { guessLat, guessLng, score, distanceKm, isComplete: true });

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    const allDone = rounds.every((r) => r.isComplete || r._id === round._id);
    const totalScore =
      rounds.reduce((sum, r) => sum + (r.score ?? 0), 0) + score -
      (rounds.find((r) => r._id === round._id)?.score ?? 0);

    if (allDone) {
      await ctx.db.patch(gameId, { isComplete: true, totalScore });

      // Update seenLocationIds for anti-farming (scores live on-chain)
      const player = await ctx.db
        .query("players")
        .withIndex("by_address", (q) => q.eq("address", game.playerAddress))
        .unique();
      if (player) {
        const newSeen = [...new Set([...player.seenLocationIds, ...rounds.map((r) => r.locationId)])];
        await ctx.db.patch(player._id, { seenLocationIds: newSeen });
      }

      await applyStreakUpdate(ctx, game.playerAddress);
    }

    return {
      score,
      distanceKm,
      answerLat: location.lat,
      answerLng: location.lng,
      placeName: location.placeName,
      gameComplete: allDone,
      totalScore: allDone ? totalScore : undefined,
    };
  },
});

export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    return { ...game, rounds };
  },
});

// Internal query used by the voucher-signing action
export const getGameForVoucher = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return ctx.db.get(gameId);
  },
});
