import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ── Pre-defined regions ────────────────────────────────────────────────────
// Mapillary's Graph API caps bbox area at 0.010 sq degrees (~11km square at
// the equator) — a whole-country box is thousands of times too large and the
// API just 500s. So each region here is a small box (~0.09° x 0.09°, ~0.008
// sq deg) around that country's capital/largest city, where Mapillary
// coverage is actually dense, rather than an empty-countryside random spot.
// bbox: [minLng, minLat, maxLng, maxLat]
const REGIONS = [
  { name: "Kenya",        countryCode: "KE", bbox: [36.772, -1.331, 36.862, -1.241] },  // Nairobi
  { name: "Nigeria",      countryCode: "NG", bbox: [3.334,   6.479,  3.424,  6.569] },  // Lagos
  { name: "Ghana",        countryCode: "GH", bbox: [-0.250,  5.569, -0.160,  5.659] },  // Accra
  { name: "Ethiopia",     countryCode: "ET", bbox: [38.702,  8.980, 38.792,  9.070] },  // Addis Ababa
  { name: "South Africa", countryCode: "ZA", bbox: [28.002,-26.249, 28.092,-26.159] },  // Johannesburg
  { name: "Senegal",      countryCode: "SN", bbox: [-17.512,14.671,-17.422, 14.761] },  // Dakar
  { name: "Tanzania",     countryCode: "TZ", bbox: [39.163, -6.837, 39.253, -6.747] },  // Dar es Salaam
  { name: "Egypt",        countryCode: "EG", bbox: [31.191, 29.999, 31.281, 30.089] },  // Cairo
  { name: "Morocco",      countryCode: "MA", bbox: [-7.634, 33.528, -7.544, 33.618] },  // Casablanca
  { name: "Brazil",       countryCode: "BR", bbox: [-46.678,-23.595,-46.588,-23.505] }, // São Paulo
  { name: "India",        countryCode: "IN", bbox: [72.832, 19.031, 72.922, 19.121] },  // Mumbai
  { name: "Indonesia",    countryCode: "ID", bbox: [106.800,-6.253, 106.890, -6.163] }, // Jakarta
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      { headers: { "User-Agent": "GoodTrip/1.0 (goodtrip-game)" } }
    );
    if (!res.ok) return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    const json = await res.json() as {
      display_name?: string;
      address?: { city?: string; town?: string; village?: string; county?: string; state?: string; country?: string };
    };
    const a = json.address ?? {};
    const locality = a.city ?? a.town ?? a.village ?? a.county ?? a.state ?? "";
    const country = a.country ?? "";
    return [locality, country].filter(Boolean).join(", ")
      || json.display_name?.split(",").slice(0, 2).join(",").trim()
      || `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  } catch {
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const WIKIMEDIA_USER_AGENT = "GoodTrip/1.0 (goodtrip-game)";

/**
 * Deletes all locations in a region (and resets its locationCount to 0).
 * Usage: npx convex run admin:clearRegionLocations '{"regionId":"<id>"}'
 */
export const clearRegionLocations = internalMutation({
  args: { regionId: v.id("regions") },
  handler: async (ctx, { regionId }) => {
    const existing = await ctx.db.query("locations").withIndex("by_region", (q) => q.eq("regionId", regionId)).collect();
    for (const loc of existing) await ctx.db.delete(loc._id);
    await ctx.db.patch(regionId, { locationCount: 0 });
    return { deleted: existing.length };
  },
});

// ── Seed regions ───────────────────────────────────────────────────────────

/**
 * Idempotent — safe to run multiple times.
 * Usage: npx convex run admin:seedRegions
 */
export const seedRegions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const results: { name: string; id: string; alreadyExisted: boolean }[] = [];

    for (const r of REGIONS) {
      const existing = await ctx.db
        .query("regions")
        .filter((q) => q.eq(q.field("countryCode"), r.countryCode))
        .first();

      if (existing) {
        results.push({ name: r.name, id: existing._id, alreadyExisted: true });
        continue;
      }

      const id = await ctx.db.insert("regions", {
        name: r.name,
        countryCode: r.countryCode,
        locationCount: 0,
        coverageThreshold: 20,
      });
      results.push({ name: r.name, id, alreadyExisted: false });
    }

    return results;
  },
});

// ── Dev-only seed: real landmarks, no Mapillary token required ─────────────
// Unblocks local testing before you've set up a Mapillary access token.
const TEST_LOCATIONS = [
  { placeName: "Eiffel Tower, Paris, France", lat: 48.8584, lng: 2.2945, file: "Tour_Eiffel_Wikimedia_Commons.jpg" },
  { placeName: "Sydney Opera House, Australia", lat: -33.8568, lng: 151.2153, file: "Sydney_Opera_House_Sails.jpg" },
  { placeName: "Christ the Redeemer, Rio de Janeiro, Brazil", lat: -22.9519, lng: -43.2105, file: "Christ_the_Redeemer_-_Cristo_Redentor.jpg" },
  { placeName: "Taj Mahal, Agra, India", lat: 27.1751, lng: 78.0421, file: "Taj_Mahal_in_March_2004.jpg" },
  { placeName: "Great Pyramid of Giza, Egypt", lat: 29.9792, lng: 31.1342, file: "Kheops-Pyramid.jpg" },
  { placeName: "Statue of Liberty, New York, USA", lat: 40.6892, lng: -74.0445, file: "Statue_of_Liberty_7.jpg" },
  { placeName: "Machu Picchu, Peru", lat: -13.1631, lng: -72.545, file: "Machu_Picchu%2C_Peru.jpg" },
  { placeName: "Colosseum, Rome, Italy", lat: 41.8902, lng: 12.4922, file: "Colosseum_in_Rome%2C_Italy_-_April_2007.jpg" },
] as const;

/**
 * Usage: npx convex run admin:seedTestLocations
 */
export const seedTestLocations = internalMutation({
  args: {},
  handler: async (ctx) => {
    let region = await ctx.db.query("regions").filter((q) => q.eq(q.field("countryCode"), "XX")).first();
    if (!region) {
      const id = await ctx.db.insert("regions", { name: "World (test)", countryCode: "XX", locationCount: 0, coverageThreshold: 20 });
      region = await ctx.db.get(id);
    }

    let inserted = 0;
    for (const loc of TEST_LOCATIONS) {
      const existing = await ctx.db.query("locations").filter((q) => q.eq(q.field("placeName"), loc.placeName)).first();
      if (existing) continue;
      await ctx.db.insert("locations", {
        regionId: region!._id,
        imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${loc.file}`,
        placeName: loc.placeName,
        lat: loc.lat,
        lng: loc.lng,
        isApproved: true,
        rating: 0,
        ratingCount: 0,
      });
      inserted++;
    }
    if (inserted > 0) {
      await ctx.db.patch(region!._id, { locationCount: region!.locationCount + inserted });
    }
    return { inserted, regionId: region!._id };
  },
});

// ── Import from Mapillary ──────────────────────────────────────────────────

/**
 * Import locations for one region.
 * Usage: npx convex run admin:importFromMapillary '{"regionId":"<id>","bbox":{"minLng":34,"minLat":-4.5,"maxLng":41.9,"maxLat":4.6}}'
 */
export const importFromMapillary = internalAction({
  args: {
    regionId: v.id("regions"),
    bbox: v.object({
      minLng: v.number(),
      minLat: v.number(),
      maxLng: v.number(),
      maxLat: v.number(),
    }),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { regionId, bbox, limit = 50 }) => {
    const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
    if (!accessToken) throw new Error("MAPILLARY_ACCESS_TOKEN env var not set");

    const bboxStr = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
    const res = await fetch(
      `https://graph.mapillary.com/images?bbox=${bboxStr}&fields=id,thumb_2048_url,geometry,computed_geometry&limit=${limit}&access_token=${accessToken}`
    );
    if (!res.ok) throw new Error(`Mapillary API error: ${res.status} ${await res.text()}`);

    const { data: images } = await res.json() as {
      data: {
        id: string;
        thumb_2048_url: string;
        geometry: { coordinates: [number, number] };
        computed_geometry?: { coordinates: [number, number] };
      }[];
    };

    let imported = 0;
    let skipped = 0;

    for (const img of images) {
      if (!img.thumb_2048_url) { skipped++; continue; }
      const coords = (img.computed_geometry ?? img.geometry)?.coordinates;
      if (!coords) { skipped++; continue; }
      const [lng, lat] = coords;

      await sleep(1100); // Nominatim allows 1 req/sec
      const placeName = await reverseGeocode(lat, lng);

      await ctx.runMutation(internal.locations.adminInsertLocation, {
        regionId,
        imageUrl: img.thumb_2048_url,
        mapillaryId: img.id,
        placeName,
        lat,
        lng,
      });

      imported++;
    }

    return { imported, skipped, total: images.length };
  },
});

/**
 * Seed all regions then import images for each in one shot.
 * Usage: npx convex run admin:importAllRegions '{"limit":30}'
 */
export const importAllRegions = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 30 }) => {
    const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
    if (!accessToken) throw new Error("MAPILLARY_ACCESS_TOKEN env var not set");

    const seeded = await ctx.runMutation(internal.admin.seedRegions, {});
    const results: Record<string, { imported: number; skipped: number; error?: string }> = {};

    for (const { name, id } of seeded) {
      const def = REGIONS.find((r) => r.name === name);
      if (!def) continue;

      const [minLng, minLat, maxLng, maxLat] = def.bbox;
      const regionId = id as Id<"regions">;

      const bboxStr = `${minLng},${minLat},${maxLng},${maxLat}`;
      const res = await fetch(
        `https://graph.mapillary.com/images?bbox=${bboxStr}&fields=id,thumb_2048_url,geometry,computed_geometry&limit=${limit}&access_token=${accessToken}`
      );
      if (!res.ok) {
        results[name] = { imported: 0, skipped: 0, error: `${res.status} ${await res.text()}` };
        continue;
      }

      const { data: images } = await res.json() as {
        data: {
          id: string;
          thumb_2048_url: string;
          geometry: { coordinates: [number, number] };
          computed_geometry?: { coordinates: [number, number] };
        }[];
      };

      let imported = 0;
      let skipped = 0;

      for (const img of images) {
        if (!img.thumb_2048_url) { skipped++; continue; }
        const coords = (img.computed_geometry ?? img.geometry)?.coordinates;
        if (!coords) { skipped++; continue; }
        const [lng, lat] = coords;

        await sleep(1100);
        const placeName = await reverseGeocode(lat, lng);

        await ctx.runMutation(internal.locations.adminInsertLocation, {
          regionId,
          imageUrl: img.thumb_2048_url,
          mapillaryId: img.id,
          placeName,
          lat,
          lng,
        });

        imported++;
      }

      results[name] = { imported, skipped };
      await sleep(2000); // pause between regions
    }

    return results;
  },
});

// ── Import from Wikimedia Commons ───────────────────────────────────────────
// Interim photo source while Mapillary's Graph API /images endpoint is down
// (confirmed ongoing outage on their own community forum, not fixable here —
// every bbox-filtered request 500s regardless of size/location). Commons'
// geosearch is free, needs no API key, and is queryable by coordinate, unlike
// the hand-picked TEST_LOCATIONS list above. Trade-off: these are volunteer
// photos of notable places, not true 360° street-level imagery — swap for
// Google Street View later per plan.

interface WikimediaGeoResult { title: string; lat: number; lon: number; pageid: number }

async function wikimediaGeosearch(lat: number, lng: number, radiusMeters: number, limit: number): Promise<WikimediaGeoResult[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=${radiusMeters}&gslimit=${limit}&gsnamespace=6&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": WIKIMEDIA_USER_AGENT } });
  if (!res.ok) throw new Error(`Wikimedia geosearch error: ${res.status} ${await res.text()}`);
  const json = await res.json() as { query?: { geosearch?: WikimediaGeoResult[] } };
  return json.query?.geosearch ?? [];
}

async function wikimediaImageInfo(titles: string[]): Promise<Map<string, { url: string; width: number; mime: string }>> {
  const out = new Map<string, { url: string; width: number; mime: string }>();
  for (const batch of chunk(titles, 50)) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(batch.join("|"))}&prop=imageinfo&iiprop=url|size|mime&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": WIKIMEDIA_USER_AGENT } });
    if (!res.ok) continue;
    const json = await res.json() as { query?: { pages?: Record<string, { title: string; imageinfo?: { url: string; width: number; mime: string }[] }> } };
    for (const page of Object.values(json.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      if (info) out.set(page.title, { url: info.url, width: info.width, mime: info.mime });
    }
  }
  return out;
}

// Geosearch returns whatever's geotagged near a point, including indoor
// museum/artifact close-ups that give zero visual clue to where they were
// taken (e.g. "Jewellery section in Nairobi Gallery") — useless for a
// geo-guessing game even though they're perfectly valid Commons photos.
// Filtering by title keyword is crude but catches most of them.
const INDOOR_TITLE_DENYLIST = [
  "gallery", "exhibit", "museum", "collection", "artifact", "sculpture",
  "clothing", "jewellery", "jewelry", "costume", "mask", "ritual",
  "painting", "portrait", "artwork", "interior", "display",
  // Government/diplomatic archives (e.g. bulk-uploaded US State Dept photos)
  // are commonly geotagged at an embassy/hotel but show indoor handshake/
  // podium photos with zero visual location clue — same problem, different
  // source. Caught a whole cluster of these near a real government building.
  "secretary", "ambassador", "delegation", "minister", "chairperson",
  "meets with", "meeting with", "press conference", "news conference",
  "policy speech", "bids farewell", "reviews documents", "chats with",
  "addresses reporters", "boards air force", "commissioner",
  // Wikimedia's own community documents its meetups/edit-a-thons/workshops
  // heavily in some cities (parts of Africa especially, since local chapters
  // actively encourage this) — same indoor-with-no-location-clue problem
  // again, just a third source of it.
  "workshop", "bootcamp", "mentorship", "meetup", "meet-up", "editathon",
  "edit-a-thon", "arts + feminism", "arts and feminism", "wiki women",
  "wikimedia", "training session", "conference", "hackathon", "summit",
  "training of trainers", " tot'", " tot ", "wikipedia class", "class photo",
];

function isUsablePhoto(title: string, info: { width: number; mime: string } | undefined): info is { width: number; mime: string } {
  if (!info) return false;
  if (info.width < 800) return false; // skip thumbnails/icons
  if (info.mime !== "image/jpeg" && info.mime !== "image/png") return false;
  const lower = title.toLowerCase();
  return !INDOOR_TITLE_DENYLIST.some((kw) => lower.includes(kw));
}

/**
 * Import locations for one region from Wikimedia Commons.
 * Usage: npx convex run admin:importFromWikimedia '{"regionId":"<id>","lat":-1.286,"lng":36.817}'
 */
export const importFromWikimedia = internalAction({
  args: {
    regionId: v.id("regions"),
    lat: v.number(),
    lng: v.number(),
    radiusMeters: v.optional(v.number()), // Commons caps this at 10000
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { regionId, lat, lng, radiusMeters = 9000, limit = 30 }) => {
    const results = await wikimediaGeosearch(lat, lng, radiusMeters, limit);
    if (results.length === 0) return { imported: 0, skipped: 0, total: 0 };

    const infoByTitle = await wikimediaImageInfo(results.map((r) => r.title));

    let imported = 0;
    let skipped = 0;
    for (const r of results) {
      const info = infoByTitle.get(r.title);
      if (!isUsablePhoto(r.title, info)) { skipped++; continue; }

      await sleep(1100); // Nominatim allows 1 req/sec
      const placeName = await reverseGeocode(r.lat, r.lon);

      await ctx.runMutation(internal.locations.adminInsertLocation, {
        regionId,
        imageUrl: info.url,
        placeName,
        lat: r.lat,
        lng: r.lon,
      });
      imported++;
    }

    return { imported, skipped, total: results.length };
  },
});

/**
 * Seed all regions then import from Wikimedia Commons for each in one shot.
 * Usage: npx convex run admin:importAllRegionsFromWikimedia '{"limit":30}'
 */
export const importAllRegionsFromWikimedia = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 30 }) => {
    const seeded = await ctx.runMutation(internal.admin.seedRegions, {});
    const results: Record<string, { imported: number; skipped: number; error?: string }> = {};

    for (const { name, id } of seeded) {
      const def = REGIONS.find((r) => r.name === name);
      if (!def) continue;

      const [minLng, minLat, maxLng, maxLat] = def.bbox;
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const regionId = id as Id<"regions">;

      try {
        const geoResults = await wikimediaGeosearch(centerLat, centerLng, 9000, limit);
        const infoByTitle = await wikimediaImageInfo(geoResults.map((r) => r.title));

        let imported = 0;
        let skipped = 0;
        for (const r of geoResults) {
          const info = infoByTitle.get(r.title);
          if (!isUsablePhoto(r.title, info)) { skipped++; continue; }

          await sleep(1100);
          const placeName = await reverseGeocode(r.lat, r.lon);

          await ctx.runMutation(internal.locations.adminInsertLocation, {
            regionId,
            imageUrl: info.url,
            placeName,
            lat: r.lat,
            lng: r.lon,
          });
          imported++;
        }

        results[name] = { imported, skipped };
      } catch (e) {
        results[name] = { imported: 0, skipped: 0, error: e instanceof Error ? e.message : String(e) };
      }

      await sleep(1000); // pause between regions
    }

    return results;
  },
});
