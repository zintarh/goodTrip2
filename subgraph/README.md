# GoodTrip subgraph

Indexes `PlayerRegistry` (username registration) and `ScoreRegistry` (score
events) into a single `Player { id, username, totalScore, gamesPlayed }`
entity, so the leaderboard is one sorted GraphQL query instead of an
RPC `getLogs` scan from block 0 (what `apps/web/app/leaderboard/page.tsx`
does today).

## Why this isn't deployed yet

**Goldsky doesn't support Celo Sepolia as a subgraph network** — only Celo
mainnet (`network: celo`) is supported
([confirmed against Goldsky's supported-networks docs](https://docs.goldsky.com/chains/supported-networks)).
GoodTrip's contracts are currently only deployed to Celo Sepolia for testing,
so there's nothing to index yet. The code here is fully written, `codegen`
and `build` both pass locally — it's blocked on having real contract
addresses on Celo mainnet, not on the subgraph logic itself.

## Deploying once contracts are on mainnet

1. Deploy `PlayerRegistry` and `ScoreRegistry` to Celo mainnet (see
   `contracts/script/Deploy.s.sol`).
2. In `subgraph.yaml`, replace `PLAYER_REGISTRY_MAINNET_ADDRESS` /
   `SCORE_REGISTRY_MAINNET_ADDRESS` with the real deployed addresses, and set
   both `startBlock` fields to the deployment block (lower = slower initial
   sync, but 0 is safe/simplest).
3. From this directory:
   ```bash
   pnpm codegen
   pnpm build
   pnpm deploy   # goldsky subgraph deploy goodtrip/1.0.0 --path .
   ```
   (Needs `GOLDSKY_API_KEY` set in your shell — same key used elsewhere in
   this project's `.env.local`.)
4. Copy the GraphQL API URL Goldsky prints into `NEXT_PUBLIC_SUBGRAPH_URL`
   in `apps/web/.env.local`, and update `app/leaderboard/page.tsx` to query
   it (`{ players(orderBy: totalScore, orderDirection: desc, first: 50) { id username totalScore } }`)
   instead of the current `getLogs` scan.
