import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { verifyGDTransfer } from "./lib/verifyPayment";

export const STREAK_FREEZE_COST_GD = "20";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

// Called from games.ts when a game completes. Increments the streak once per
// UTC day; if exactly one day was missed and the player has a banked freeze,
// it's auto-consumed to preserve the streak instead of resetting it.
export async function applyStreakUpdate(ctx: MutationCtx, playerAddress: string): Promise<void> {
  const player = await ctx.db
    .query("players")
    .withIndex("by_address", (q) => q.eq("address", playerAddress))
    .unique();
  if (!player) return;

  const today = todayUTC();
  const last = player.lastPlayedDate;
  const currentStreak = player.currentStreak ?? 0;
  const longestStreak = player.longestStreak ?? 0;
  const freezes = player.streakFreezes ?? 0;

  if (last === today) return; // already played today — no change

  let nextStreak: number;
  let nextFreezes = freezes;

  if (!last) {
    nextStreak = 1;
  } else {
    const gap = daysBetween(last, today);
    if (gap === 1) {
      nextStreak = currentStreak + 1;
    } else if (gap === 2 && freezes > 0) {
      nextStreak = currentStreak + 1; // freeze covers the missed day
      nextFreezes = freezes - 1;
    } else {
      nextStreak = 1;
    }
  }

  await ctx.db.patch(player._id, {
    currentStreak: nextStreak,
    longestStreak: Math.max(longestStreak, nextStreak),
    lastPlayedDate: today,
    streakFreezes: nextFreezes,
  });
}

export const getStreakInfo = query({
  args: { playerAddress: v.string() },
  handler: async (ctx, { playerAddress }): Promise<{
    currentStreak: number;
    longestStreak: number;
    streakFreezes: number;
    playedToday: boolean;
    freezeCostGD: string;
  }> => {
    const player: Doc<"players"> | null = await ctx.db
      .query("players")
      .withIndex("by_address", (q) => q.eq("address", playerAddress))
      .unique();
    return {
      currentStreak: player?.currentStreak ?? 0,
      longestStreak: player?.longestStreak ?? 0,
      streakFreezes: player?.streakFreezes ?? 0,
      playedToday: player?.lastPlayedDate === todayUTC(),
      freezeCostGD: STREAK_FREEZE_COST_GD,
    };
  },
});

export const purchaseStreakFreeze = mutation({
  args: {
    playerAddress: v.string(),
    txHash: v.string(),
  },
  handler: async (ctx, { playerAddress, txHash }) => {
    const alreadyUsed = await ctx.db
      .query("streak_freeze_purchases")
      .withIndex("by_tx_hash", (q) => q.eq("txHash", txHash))
      .first();
    if (alreadyUsed) throw new Error("This payment has already been used.");

    await verifyGDTransfer({ txHash, from: playerAddress, minAmountDecimal: STREAK_FREEZE_COST_GD });

    const player = await ctx.db
      .query("players")
      .withIndex("by_address", (q) => q.eq("address", playerAddress))
      .unique();
    if (!player) throw new Error("Play a round first to create your profile.");

    await ctx.db.patch(player._id, { streakFreezes: (player.streakFreezes ?? 0) + 1 });
    await ctx.db.insert("streak_freeze_purchases", {
      playerAddress,
      costGD: STREAK_FREEZE_COST_GD,
      txHash,
    });

    return { streakFreezes: (player.streakFreezes ?? 0) + 1, costGD: STREAK_FREEZE_COST_GD };
  },
});
