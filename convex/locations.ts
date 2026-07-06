import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByRegion = query({
  args: { regionId: v.id("regions") },
  handler: async (ctx, { regionId }) => {
    return ctx.db
      .query("locations")
      .withIndex("by_region", (q) => q.eq("regionId", regionId))
      .filter((q) => q.eq(q.field("isApproved"), true))
      .collect();
  },
});

export const listRegions = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("regions").collect();
  },
});

// Returns only safe fields for an active round — never leaks lat/lng before guess is locked.
export const getLocationForRound = query({
  args: {
    locationId: v.id("locations"),
    gameId: v.id("games"),
  },
  handler: async (ctx, { locationId, gameId }) => {
    // Verify the game exists (the client shouldn't be able to pass arbitrary locationIds)
    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const location = await ctx.db.get(locationId);
    if (!location) return null;

    // Return image metadata only — coordinates AND placeName are withheld until
    // submitGuess. placeName (e.g. "Taj Mahal, Agra, India") is effectively the
    // answer, so leaking it here would let anyone inspecting the query response
    // read it off before locking a guess. It's surfaced in submitGuess's result.
    return {
      imageUrl: location.imageUrl,
      mapillaryId: location.mapillaryId ?? null,
    };
  },
});

// Called internally by the Mapillary import action — not exposed to clients.
export const adminInsertLocation = internalMutation({
  args: {
    regionId: v.id("regions"),
    imageUrl: v.string(),
    mapillaryId: v.optional(v.string()),
    placeName: v.string(),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, args) => {
    // Skip if this Mapillary image is already in the table
    if (args.mapillaryId) {
      const existing = await ctx.db
        .query("locations")
        .filter((q) => q.eq(q.field("mapillaryId"), args.mapillaryId))
        .first();
      if (existing) return existing._id;
    }

    const id = await ctx.db.insert("locations", {
      ...args,
      isApproved: true, // admin-imported = pre-approved
      rating: 0,
      ratingCount: 0,
    });

    // Increment the region's location count
    const region = await ctx.db.get(args.regionId);
    if (region) {
      await ctx.db.patch(args.regionId, {
        locationCount: region.locationCount + 1,
      });
    }

    return id;
  },
});
