import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Upserts a minimal player record used only for anti-farming (seenLocationIds).
// Profile data (username, scores) lives on-chain in PlayerRegistry / ScoreRegistry.
export const ensurePlayer = internalMutation({
  args: { address: v.string() },
  handler: async (ctx, { address }) => {
    const existing = await ctx.db
      .query("players")
      .withIndex("by_address", (q) => q.eq("address", address))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("players", { address, seenLocationIds: [] });
  },
});
