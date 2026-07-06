"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { publicClient } from "@/lib/viem-client";
import { SCORE_REGISTRY_ABI, PLAYER_REGISTRY_ABI, getContractAddresses } from "@/lib/contracts";
import { parseAbiItem } from "viem";
import { LoadingIcon } from "@/components/ui/LoadingIcon";

type Tab = "weekly" | "alltime";

interface Row {
  rank: number;
  address: string;
  username: string;
  score: number;
}

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
const LOG_CHUNK_BLOCKS = 5000n; // public RPCs cap eth_getLogs block ranges; scanning from 0 in one call fails silently

// Goldsky doesn't support Celo Sepolia as a subgraph network (mainnet only),
// so on testnet there is no subgraph to query yet — see subgraph/README.md.
// This queries it when configured (post-mainnet-deploy) and otherwise falls
// back to a chunked on-chain log scan.
async function fetchFromSubgraph(): Promise<Row[] | null> {
  if (!SUBGRAPH_URL) return null;
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ players(orderBy: totalScore, orderDirection: desc, first: 50) { id username totalScore } }`,
    }),
  });
  if (!res.ok) throw new Error(`Subgraph error: ${res.status}`);
  const { data, errors } = await res.json() as {
    data?: { players: { id: string; username: string | null; totalScore: string }[] };
    errors?: { message: string }[];
  };
  if (errors?.length) throw new Error(errors[0].message);
  return (data?.players ?? []).map((p, i) => ({
    rank: i + 1,
    address: p.id,
    username: p.username || `${p.id.slice(0, 6)}…${p.id.slice(-4)}`,
    score: Number(p.totalScore),
  }));
}

const SCORE_RECORDED_EVENT = parseAbiItem(
  "event ScoreRecorded(address indexed player, bytes32 indexed gameId, uint256 score)"
);

async function fetchScoreLogsChunked(address: `0x${string}`) {
  const latest = await publicClient.getBlockNumber();
  type ScoreLog = Awaited<ReturnType<typeof publicClient.getLogs<typeof SCORE_RECORDED_EVENT>>>[number];
  const logs: ScoreLog[] = [];
  for (let from = 0n; from <= latest; from += LOG_CHUNK_BLOCKS) {
    const to = from + LOG_CHUNK_BLOCKS - 1n > latest ? latest : from + LOG_CHUNK_BLOCKS - 1n;
    // eslint-disable-next-line no-await-in-loop -- chunks must be sequential, ranges depend on the previous cursor
    const chunk = await publicClient.getLogs({ address, event: SCORE_RECORDED_EVENT, fromBlock: from, toBlock: to });
    logs.push(...chunk);
  }
  return logs;
}

export default function LeaderboardPage() {
  const [tab, setTab]     = useState<Tab>("alltime");
  const [rows, setRows]   = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const contracts = getContractAddresses();

  useEffect(() => {
    loadLeaderboard();
  }, [contracts.scoreRegistry]);

  async function loadLeaderboard() {
    setLoading(true);
    setLoadError(null);
    try {
      const subgraphRows = await fetchFromSubgraph();
      if (subgraphRows) {
        setRows(subgraphRows);
        setLoading(false);
        return;
      }

      if (!contracts.scoreRegistry) { setRows([]); setLoading(false); return; }

      // Aggregate all ScoreRecorded events by player
      const logs = await fetchScoreLogsChunked(contracts.scoreRegistry);

      const totals = new Map<string, number>();
      for (const log of logs) {
        const args = (log as unknown as { args: { player?: string; score?: bigint } }).args;
        const player = args.player?.toLowerCase() ?? "";
        const score  = Number(args.score ?? 0n);
        totals.set(player, (totals.get(player) ?? 0) + score);
      }

      // Sort descending
      const sorted = [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);

      // Resolve usernames from PlayerRegistry
      const withNames = await Promise.all(
        sorted.map(async ([addr, score], i) => {
          let username = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
          if (contracts.playerRegistry) {
            try {
              const [name] = await publicClient.readContract({
                address: contracts.playerRegistry,
                abi: PLAYER_REGISTRY_ABI,
                functionName: "getPlayer",
                args: [addr as `0x${string}`],
              }) as [string, bigint];
              if (name) username = name;
            } catch { /* ignore */ }
          }
          return { rank: i + 1, address: addr, username, score };
        })
      );

      setRows(withNames);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load the leaderboard.");
      setRows([]);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <Navbar />
      <main className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-3xl font-black">Leaderboard</h1>

          <div className="flex gap-2">
            <TabButton label="All-time" active={tab === "alltime"} onClick={() => setTab("alltime")} />
            <TabButton label="Weekly"   active={tab === "weekly"}  onClick={() => setTab("weekly")}  />
          </div>

          {tab === "weekly" && (
            <p className="text-sm text-gray-500 font-semibold card-duo px-5 py-4">
              Weekly rankings coming soon — requires Goldsky subgraph for efficient time-windowed queries.
            </p>
          )}

          {tab === "alltime" && (
            <div className="card-duo divide-y-2 divide-gray-100">
              {loading && (
                <div className="py-8"><LoadingIcon /></div>
              )}
              {!loading && loadError && (
                <p className="text-red-500 font-semibold text-sm text-center py-8 px-4">{loadError}</p>
              )}
              {!loading && !loadError && !contracts.scoreRegistry && (
                <p className="text-gray-400 font-semibold text-sm text-center py-8">
                  Set NEXT_PUBLIC_SCORE_REGISTRY_ADDRESS to load on-chain scores.
                </p>
              )}
              {!loading && !loadError && contracts.scoreRegistry && rows?.length === 0 && (
                <p className="text-gray-400 font-semibold text-sm text-center py-8">No scores yet — play a game!</p>
              )}
              {rows?.map((row) => (
                <LeaderRow key={row.address} {...row} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-bold transition ${
        active ? "bg-brand-purple text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

function LeaderRow({ rank, username, score }: Row) {
  const isTopThree = rank <= 3;
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-black ${
        isTopThree ? "bg-brand-purpleLight text-brand-purple" : "text-gray-400"
      }`}>
        {rank}
      </span>
      <span className="flex-1 font-bold text-sm">{username}</span>
      <span className="font-black">{score.toLocaleString()} pts</span>
    </div>
  );
}
