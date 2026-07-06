import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyGDTransfer } from "./lib/verifyPayment";

const HINT_COSTS: Record<string, string> = {
  "region-reveal": "10",
  "area-narrow": "25",
  "place-clue": "50",
};

export const purchaseHint = mutation({
  args: {
    playerAddress: v.string(),
    roundId: v.id("rounds"),
    hintType: v.union(
      v.literal("region-reveal"),
      v.literal("area-narrow"),
      v.literal("place-clue")
    ),
    txHash: v.string(),
  },
  handler: async (ctx, { playerAddress, roundId, hintType, txHash }) => {
    const alreadyUsed = await ctx.db
      .query("hints_log")
      .withIndex("by_tx_hash", (q) => q.eq("txHash", txHash))
      .first();
    if (alreadyUsed) throw new Error("This payment has already been used.");

    const costGD = HINT_COSTS[hintType];
    await verifyGDTransfer({ txHash, from: playerAddress, minAmountDecimal: costGD });

    await ctx.db.insert("hints_log", {
      playerAddress,
      roundId,
      hintType,
      costGD,
      txHash,
    });
    return { hintType, costGD };
  },
});
