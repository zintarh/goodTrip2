# Seeding locations from Mapillary

## 0. First-time Convex setup

Run this once to initialise the Convex project and generate the required types:

```bash
# At the repo root
npx convex dev
# Follow the prompts — log in / create a new project.
# This generates convex/_generated/ and sets CONVEX_DEPLOY_KEY.
# Copy the NEXT_PUBLIC_CONVEX_URL it prints into apps/web/.env.local.
```

Then set your signing key for future on-chain score vouchers:

```bash
npx convex env set CONVEX_BACKEND_SIGNING_KEY <a-random-32-byte-hex>
```

GoodTrip pulls street-level photos from the Mapillary API instead of managing contributor uploads. This doc covers how to seed your Convex database with real locations.

## 1. Get a Mapillary access token

1. Go to [mapillary.com/developer](https://www.mapillary.com/developer) and sign in (free account).
2. Create an application → copy the **Client Access Token**.
3. Add it to your Convex environment variables:

```bash
npx convex env set MAPILLARY_ACCESS_TOKEN <your-token>
```

## 2. Make sure Convex is running

```bash
npx convex dev   # in a separate terminal, or already running
```

## 3. Option A — Import everything at once

Seeds all 12 predefined regions then fetches 30 images per region (~360 locations total).

```bash
npx convex run admin:importAllRegions '{"limit":30}'
```

This takes ~15 minutes due to Nominatim's 1 req/sec rate limit for reverse geocoding.

## 4. Option B — Seed regions, then import one at a time

```bash
# Step 1: seed the regions table (idempotent)
npx convex run admin:seedRegions

# Step 2: copy a regionId from the output, then run per region
npx convex run admin:importFromMapillary '{
  "regionId": "<id from step 1>",
  "bbox": { "minLng": 34, "minLat": -4.5, "maxLng": 41.9, "maxLat": 4.6 },
  "limit": 50
}'
```

Predefined bounding boxes (copy as needed):

| Region       | minLng | minLat | maxLng | maxLat |
|---|---|---|---|---|
| Kenya        | 34.0   | -4.5   | 41.9   | 4.6    |
| Nigeria      | 3.0    | 4.5    | 14.7   | 13.9   |
| Ghana        | -3.3   | 4.7    | 1.2    | 11.2   |
| Ethiopia     | 33.0   | 3.4    | 47.9   | 14.9   |
| South Africa | 16.5   | -34.9  | 32.9   | -22.1  |
| Senegal      | -17.5  | 12.3   | -11.4  | 15.0   |
| Tanzania     | 29.5   | -11.7  | 40.4   | -1.0   |
| Egypt        | 24.7   | 22.0   | 37.0   | 31.7   |
| Morocco      | -13.2  | 27.7   | -1.0   | 35.9   |
| Brazil       | -48.9  | -23.8  | -43.1  | -22.7  |
| India        | 72.8   | 18.9   | 77.3   | 28.7   |
| Indonesia    | 106.6  | -6.4   | 107.0  | -6.1   |

## 5. Attribution

Mapillary images are displayed with a `© Mapillary contributors` link in the game UI (already wired up in `apps/web/app/play/page.tsx`).

## Notes

- `importFromMapillary` is **idempotent** — re-running skips images already in the DB by `mapillaryId`.
- Regions unlock in the game UI once they have ≥ 20 approved locations (`coverageThreshold`).
- To add more locations to a region later, just re-run with a higher `limit` or a different bounding box sub-region.
