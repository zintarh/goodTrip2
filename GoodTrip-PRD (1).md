# Product Requirements Document — *GoodTrip* (working title)

**A community-powered geo-guessing game built on the GoodDollar (G$) ecosystem.**

| | |
|---|---|
| **Version** | 1.0 (Clean draft) |
| **Status** | For review |
| **Last updated** | June 25, 2026 |
| **Platform** | Responsive web app (mobile-first, PWA) |
| **Tokens** | G$ (native utility) + USDT (stable stakes/prizes) |
| **Chain** | Celo (low gas, G$-native) |
| **Key stack** | Web3Auth (login + embedded wallet) · Convex (reactive backend) · Goldsky (subgraph indexing) · Leaflet/OSM (maps) |

---

## 1. Summary

GoodTrip is a web-based location-guessing game. A player is shown a photograph and drops a pin on a map where they think it was taken; the closer the guess, the more points they earn. All imagery comes from a **curated, whitelisted community of contributors** who photograph real streets, landmarks, and everyday places — with a deliberate emphasis on regions like East and West Africa that are under-represented in mainstream mapping products.

GoodTrip is intentionally small and community-scoped, built around the GoodDollar economy. It is **not** a substitute for Google Maps or Street View and uses **no** Street View imagery. Its purpose is twofold: to be a fun, replayable game, and to create **real circulation and utility for G$** through hint purchases, staked matches, and milestone rewards — while onboarding new verified members into the ecosystem.

---

## 2. Goals & non-goals

### 2.1 Goals
- Ship a fun, replayable geo-guessing game playable entirely in the browser.
- Create a genuine **G$ sink** (hints, match stakes) so the app strengthens the token rather than draining it.
- Drive **new verified-member onboarding** via shareable invite codes.
- Showcase under-represented regions and let people "see the world" through community eyes.
- Reward activity and skill with **on-chain, claimable** rewards in G$ and USDT.
- Be **scalable from day one** — the architecture must hold as players, locations, and matches grow, without re-platforming.

### 2.2 Non-goals (v1)
- Not a replacement for Google Maps / Street View; no Street View imagery.
- No real-time synchronous multiplayer lobbies (invite-code matches; async completion).
- No open public uploads (whitelisted contributors only).
- No native mobile apps (responsive web / PWA only).

---

## 3. Success metrics

| Metric | Why it matters |
|---|---|
| Weekly active players | Core engagement / retention |
| Games per player per week | Depth of engagement |
| Invite codes sent → new signups | Viral / onboarding loop |
| G$ spent on hints + staked per week | Token utility / sink health |
| Net token flow (sinks − emissions) | Ecosystem health (target: net-neutral to net-positive) |
| Playable locations per active region | Content supply health |
| New verified members acquired | Direct ecosystem contribution |

---

## 4. Users & roles

1. **Players** — any verified G$ member. Play rounds, climb leaderboards, buy hints, create/join staked matches, claim points and rewards, earn travel badges.
2. **Whitelisted Contributors** — trusted members manually approved by an admin; the **only** accounts that can access the submission dashboard and upload locations. Whitelisting exists because uploaders inevitably know the answers to their own locations, so restricting uploads to vetted people prevents rigging and keeps quality high.
3. **Admins** — manage the whitelist, seed/curate content, moderate reported locations, configure economic parameters (hint prices, reward tiers, rake, split tables), and manage regions.

---

## 5. Onboarding & profile

First-run experience, designed to get non-crypto-native users into a wallet and a game with minimal friction.

1. **Login (Web3Auth).** The user logs in with email or a social provider. Web3Auth provisions a **non-custodial embedded wallet on Celo** (MPC) — no seed phrase, no extension. This is essential for GoodDollar's audience, many of whom are new to crypto.
2. **Email captured.** Stored on the profile for recovery, notifications, and re-engagement.
3. **Profile setup (first time only).** The user **chooses an avatar** and **sets a username** (uniqueness checked in Convex). The profile links to their wallet address and, where required, to their GoodDollar verification status.
4. **Dashboard.** Shows all-time score, current weekly rank, badges / avatar travel map, and options to **Play** (solo) or **Create a game** (staked match).

> The profile record lives off-chain in Convex; the **wallet address is the canonical identity** tying off-chain profile to on-chain score, stakes, and claims.

---

## 6. Core gameplay loop

1. From the dashboard, the player chooses **Play** (Random / Region) or **Create a game** (staked match with invite code).
2. A game = **5 rounds**; each round shows one image.
3. Below the image is a **blank, clickable map** (Leaflet + OpenStreetMap tiles) — no pin, no zoom hint.
4. The player clicks where they think the photo was taken and confirms. The client sends **only the raw guess coordinates** to the server.
5. The server (Convex) computes the distance from the secret answer pin (haversine) and awards **0–500 points** on a falloff curve.
6. The real location is revealed: both pins, a line between them, distance and points.
7. After 5 rounds, the player sees their game total (max 2,500) and rank.
8. The game result is **recorded on-chain** via a server-attested transaction the player signs (see §9). All-time score updates, weekly score updates, and any crossed milestone unlocks a reward.
9. For staked matches, once all players finish, the match **settles on-chain** and **winners claim their share** of the pot. The player can then **start again**.

---

## 7. Functional requirements

### 7.1 Scoring

- Per-round score: **0–500**, by distance from the answer pin.
- Curve: `score = round(500 * e^(-distance_km / D))`, where `D` is a tunable distance constant.
- **Mode-aware `D`:** guessing within one country is far easier than worldwide, so `D` tightens in Region mode (e.g., world `D ≈ 2000`, single-country `D ≈ 150–300`) or every guess maxes out and the leaderboard flattens. Tuned during testing.
- Exact pin = 500; points fall off smoothly with distance.
- **Scoring is always computed server-side (Convex), never on the client.** The answer pin never reaches the client until the guess is locked.

> **Design note:** the small per-round number (500) is intentional — it keeps milestone thresholds (e.g., 10,000) spread across many games rather than reachable in one sitting. Per-round score and reward thresholds are independent design dials.

### 7.2 Points & progression

| Point type | Behavior |
|---|---|
| **Game score** | Earned per round (0–500), per game (0–2,500). Drives leaderboards. |
| **All-time score** | Cumulative, permanent. Shown on the dashboard. Never resets. |
| **Weekly score** | Resets weekly (seasonal). Drives the weekly leaderboard. |
| **Milestone points** | Cumulative total measured against reward tiers (e.g., 10,000 → reward). |

- **Anti-farming rule:** a player earns leaderboard/milestone points for a location **only on first attempt**. Replaying a memorized location yields no new points. Seen-locations tracked per user in Convex.

### 7.3 Leaderboards

- **Weekly (seasonal):** resets each week so newcomers always have a live race to join. Primary competitive surface.
- **All-time:** permanent prestige board.
- *(Recommended)* a **skill board** (average score per game) alongside the **volume board** (total points), so both grinders and sharpshooters have something to chase and early users don't build an untouchable lead.
- Leaderboards are **materialized/cached and paginated** (see §10), never recomputed by full scans per request.

### 7.4 Hints (G$ sink)

- Each round offers hints (region reveal, narrowing the search area, a clue about the place).
- A limited number of free hints; beyond that, players **buy hints with G$**.
- G$ spent on hints flows to the **treasury/reserve** — the primary, on-mission token sink.

### 7.5 Game modes

| Mode | Description |
|---|---|
| **Random** | Locations drawn from the global pool. |
| **Region** | Player picks a country/region (e.g., "Explore Kenya"); only surfaced once the region crosses a coverage threshold (see 7.7). |
| **Invite match (async)** | Player creates a game; the 5 locations lock; an **invite code / link** lets friends play the exact same rounds anytime, then scores compare. Primary growth/onboarding loop. |
| **Staked match (PvP)** | An invite match with stakes (see 7.6). |

### 7.6 Staked matches, splits & two-token support

- A player **creates a game and sets a stake amount.** Each joining player deposits the stake into an **on-chain escrow pool** (Celo). Joining is via **invite code / link**.
- **Token choice per match:** G$ (low-stakes, native) or **USDT** (stable value for higher stakes).
- **Configurable payout split**, chosen by the creator:
  - **Winner-take-all** — 1st place takes the pool.
  - **Top 3** — split across the top 3 (e.g., 60 / 30 / 10, configurable).
  - **Top 4** — split across the top 4 (configurable).
- A small **treasury rake** is deducted before distribution — a secondary sink that helps offset reward emissions.
- After all players finish, the match **settles on-chain** from server-attested standings (see §9), and each eligible winner **claims their share**. Then players can **start again**.
- Stake amounts, supported tokens, rake %, and split tables are admin-configurable.

### 7.7 Regions & coverage thresholds

- A region becomes individually selectable only after **≥ ~20 playable locations**; below that, its images fold into the global Random pool.
- Under-stocked regions show a **call to action** ("Kenya needs more locations") that routes whitelisted contributors to upload — turning the cold-start problem into a content-growth driver.

### 7.8 Badges & avatar

- Players earn **travel badges** for exploring regions (e.g., enough Kenya locations → Kenya badge).
- The **avatar / world map** fills in to show where the player has "been," giving a reason to return beyond raw points.

### 7.9 Content submission (whitelisted only)

The submission dashboard is gated to **whitelisted contributor addresses.** Upload flow:

1. Contributor uploads a photo they personally took.
2. They **drop a pin on an embedded map** (or search an address) to record where it was taken — no manual latitude/longitude typing. The pin's coordinates become the stored answer.
3. The system **reverse-geocodes** the pin (e.g., Nominatim) to auto-fill a place name.
4. **Deduplication:** a perceptual hash (pHash/dHash) is compared against existing images to block exact and near-duplicate re-submissions. *(Optional: Google Vision web-detection to flag images found elsewhere online.)*
5. **Proximity check:** if the pin is within ~50 m of an existing location, flag it; allow a small capped number of distinct angles per spot rather than a hard block, so variety is preserved without repetition.
6. Image bytes go to **object storage + CDN**; metadata + hash + pin go to Convex. The location enters a light **moderation/rating queue**; players rate locations so good ones surface and weak ones sink.

> **Coordinate caveat:** on a web app the contributor usually isn't physically at the location when uploading, so the pin can't be auto-verified against the photo. The whitelist is what makes this acceptable — coordinates are trusted because contributors are trusted.

---

## 8. Token economy

### 8.1 Faucets vs. sinks

| Direction | Mechanism | Token |
|---|---|---|
| **Sink** (→ treasury) | Hint purchases | G$ |
| **Sink** | Staked-match rake | G$ / USDT |
| **Emission** (→ players) | Milestone reward payouts | G$ (primary), USDT (premium tiers) |
| **P2P circulation** (net-neutral minus rake) | Staked-match winnings | G$ / USDT |

**Health principle:** hint sinks + match rake should be tuned to offset milestone emissions so the app is **net-neutral to net-positive** for G$. An app that only emits G$ drains the token; GoodTrip builds spending into the fun.

### 8.2 Token roles

- **G$** — native utility token: hints (main sink), low-stakes matches, standard milestone rewards, everyday in-app currency. On-mission circulation.
- **USDT** — stable value for higher-stakes matches, premium milestone/tournament prizes, sponsored prize pools.

### 8.3 The on-mission loop

A contributor in Lagos photographs their street → a player in Berlin plays it and spends G$ on a hint → that G$ circulates through the treasury into rewards. Wealth circulates across borders, "see the world" becomes a literal feature, and G$ gains real utility — all in one loop.

---

## 9. Scoring & settlement pipeline (canonical)

This is the single source of truth for how a score goes from a click to an on-chain record. It satisfies two requirements at once: **scores are computed off-chain (they must be), and recorded on-chain (we want the permanent, auditable, stake-settling record).** "Compute in Convex" and "record on-chain" are sequential steps, not alternatives.

**Why scoring isn't computed *inside* a contract:** haversine needs trig (sin/cos/sqrt/atan2) and floating-point math, which Solidity lacks — it would require heavy fixed-point libraries and pay gas for trig on every game. Worse, on-chain computation needs the answer coordinates on-chain, making them publicly readable so players could look up answers before guessing. So the math runs in Convex; the chain stores the verified result.

**The pipeline (server-attested, user-submitted):**

1. Player locks a guess. Client sends **only raw guess coordinates** to Convex.
2. Convex computes the score authoritatively using the secret answer pin (haversine + falloff).
3. Convex issues a signed **EIP-712 voucher**: e.g., *"wallet 0xABC scored 2,350 in game #42,"* signed with the backend signing key.
4. The player submits an **on-chain transaction** carrying that voucher — their wallet, their gas, their record.
5. The contract **verifies the server's signature**, then writes the score into on-chain state (score registry). For staked matches, settlement pays out from the attested standings per the split table, minus rake.

**What this gives you:** real on-chain transactions and state, readable on the explorer, indexable by Goldsky, usable for stake settlement — while the *value* is forgery-proof because it carries the server's attestation. A plain "user signs their own score" tx would also be on-chain, but would record whatever number the user types into dev tools; the voucher is what makes the on-chain record **trustworthy**, not what makes it on-chain.

**The one trust assumption:** the contract trusts the backend signing key — it is effectively the authority that can mint valid scores, so it must be tightly protected (HSM/KMS, rotation policy). For a community app you operate, this is the standard, pragmatic model.

**Trustless variant (deferred to v2):** having the chain itself re-verify scores with no trusted signer requires commit-reveal of answers plus on-chain trig, with a dispute window. Heavy, and not a launch requirement.

---

## 10. Technical architecture (scalable by design)

### 10.1 Stack overview

| Layer | Choice | Role |
|---|---|---|
| **Frontend** | React (Vite or Next.js), responsive PWA, via CDN | Stateless UI; scales horizontally at the edge. |
| **Auth & wallet** | **Web3Auth** | Email/social login → non-custodial embedded Celo wallet (MPC). Captures email. Removes seed-phrase friction. |
| **Off-chain backend** | **Convex** | Profiles, game sessions, rounds, location metadata, invite codes, match state, seen-locations, hint logic, moderation/rating queue, **authoritative scoring**, leaderboard materialization, voucher signing. Realtime reactivity powers live match + leaderboard updates. |
| **On-chain** | **Celo smart contracts** | Settlement only: score registry, staking escrow (with split tables), reward/milestone distribution, claims. Verifies EIP-712 vouchers. |
| **Indexing / reads** | **Goldsky subgraph** | Indexes contract events (scores, stakes, claims, payouts) into GraphQL for fast reads — leaderboards from on-chain data, claim/match history — without hammering RPC or recomputing from chain. |
| **Imagery storage + delivery** | Object storage + CDN (e.g., Cloudflare R2 / S3 + edge CDN) | Scalable, edge-cached image delivery. App servers never stream image bytes. |
| **Maps** | Leaflet + OSM tiles (MapTiler/Mapbox free tier or self-hosted at scale) | Two modes: contributor pin-set and player guess. Public OSM tiles aren't for heavy production load — use a proper tile provider as traffic grows. |
| **Geocoding** | Reverse geocode pins (e.g., Nominatim) | Auto-fill location names on upload. |
| **Scoring & dedup** | Haversine + exponential falloff (Convex); perceptual hashing (pHash/dHash) | Scoring server-side; image hashing async on upload. |
| **Identity / Sybil resistance** | GoodDollar verification + Web3Auth | One real face = one account; removes fake-account farming. |

### 10.2 On-chain vs. off-chain split

- **Off-chain (Convex):** all high-frequency gameplay — sessions, rounds, **scoring**, matchmaking, invite codes, seen-locations, leaderboard caches, moderation, voucher signing. Fast, cheap, reactive.
- **On-chain (Celo):** value/record settlement only — score registry, milestone payouts, stake escrow, multi-winner distribution, claims, voucher verification.
- **Reads (Goldsky):** anything derived from chain state is read from the subgraph, not scanned live.

### 10.3 Scalability principles

1. **Stateless frontend on a CDN** — horizontal scale, no session affinity.
2. **Game logic off-chain, settlement on-chain** — low per-action latency and cost; the chain is touched at record/stake/settle time.
3. **Reads from indexed/cached layers** — Goldsky for chain data, Convex reactive queries for game data. Leaderboards **materialized and paginated**, never full-scanned per request.
4. **Weekly partitioning** bounds leaderboard working sets; all-time uses incrementally-updated materialized aggregates.
5. **Images via object storage + CDN**, edge-cached; resize + perceptual-hash run asynchronously off the request path.
6. **Batch + idempotent** on-chain writes (claims retryable, exactly-once); gas-efficient Celo contracts.
7. **Decouple gameplay from settlement** — players finish and keep playing while record/settlement settles asynchronously (queued, retryable).
8. **Edge rate-limiting + abuse protection**; Sybil resistance handled upstream by G$ verification + Web3Auth.

---

## 11. Key user flows

### 11.1 Onboarding
Visit → Web3Auth login (email/social) → embedded Celo wallet + email saved → (first time) choose avatar + username → dashboard.

### 11.2 Play a round (solo)
Dashboard → Play (Random/Region) → image → blank guess map → click + confirm (raw coords to Convex) → server-scored 0–500 → reveal answer + line + distance → next round → game total → server voucher → player submits on-chain tx → all-time/weekly updated → play again.

### 11.3 Create & play a staked match
Dashboard → Create game → set stake + token (G$/USDT) + split (winner-take-all / top 3 / top 4) → invite code/link → friends join (deposit stake to escrow) → all play the locked 5 locations → standings computed in Convex → match settles on-chain from attested standings → winners claim share (minus rake) → start again.

### 11.4 Submit a location (whitelisted contributor)
Submission dashboard (gated) → upload photo → drop pin / search address → auto place name → perceptual-hash dedup → proximity check → image to object storage/CDN, metadata to Convex → moderation/rating queue → live in pool.

### 11.5 Claim rewards
Finish game → submit score tx → if a milestone tier is crossed → claim token reward (G$/USDT).

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Client-side score tampering | Scores computed only in Convex; client sends raw guess; answer never sent pre-lock. |
| On-chain record trust | Server-signed EIP-712 vouchers verified by the contract before crediting (see §9). |
| Backend signing-key compromise | Protect key (HSM/KMS, rotation); it is the score-minting authority. |
| Non-scalable build | Off-chain gameplay + settlement-only chain + indexed reads + CDN images + materialized leaderboards (see §10). |
| Cold start (empty regions) | Whitelisted contributors + admin seeding + optional Mapillary bootstrap; coverage thresholds + CTAs. |
| Uploaders know answers / rigging | Whitelist-only uploads; never serve a contributor their own locations; community rating. |
| Leaderboard discourages newcomers | Weekly resets; optional skill board; first-attempt-only scoring. |
| Reward farming | No points for already-seen locations; quality-gated rewards; Sybil-resistant identity. |
| Net token drain | Hint + rake sinks tuned to offset emissions; monitor net token flow. |
| Moderation burden (privacy, stolen images) | Whitelist reduces volume; report button; perceptual-hash + optional web-detection; review queue. |
| Coordinate accuracy (web, not on-site) | Trusted-contributor model; pin-drop + reverse geocode + proximity checks. |

---

## 13. Out of scope for v1 / future enhancements

- Contributor payouts (G$ to uploaders when their locations get played and rated well).
- Real-time synchronous multiplayer lobbies.
- Open (non-whitelisted) public uploads with automated trust scoring.
- Native iOS/Android apps.
- Tournaments / sponsored prize pools.
- Trustless settlement (commit-reveal + on-chain verification + dispute window).
- Auto face/license-plate blurring (if/when public uploads open up).

---

## 14. Open questions

1. Reward-tier thresholds and payout amounts (10,000 → how much G$/USDT?).
2. Hint pricing and number of free hints per round.
3. Rake percentage on staked matches.
4. Split-table percentages for top-3 and top-4 payouts.
5. Per-game claim vs. milestone-batched claim as the default.
6. Minimum locations to "open" a region (proposed ~20).
7. Weekly reset timing/timezone and season length.
8. Signing-key custody and rotation policy for the voucher signer.

---

## 15. Suggested phasing

- **MVP:** Web3Auth onboarding + profile; Random + Region modes; pin-drop scoring (Convex) with server-attested on-chain score records; whitelisted uploads; weekly + all-time leaderboards (materialized); hints (G$). Convex + Celo + Goldsky wired from the start. Bootstrap content via admin + a few contributors.
- **V1:** Invite-code matches; staked matches (G$ + USDT) with winner-take-all / top 3 / top 4 splits; badges + avatar map; milestone rewards.
- **V2:** Contributor payouts; tournaments/sponsored pools; trustless settlement; synchronous multiplayer; native apps.
