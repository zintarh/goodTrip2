"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Navbar } from "@/components/layout/Navbar";
import { useWeb3Auth } from "@/components/auth/Web3AuthProvider";
import { toFriendlyError } from "@/lib/errors";
import { publicClient, waitForSuccess } from "@/lib/viem-client";
import { STAKE_ESCROW_ABI, getContractAddresses } from "@/lib/contracts";
import { ERC20_ABI } from "@/lib/erc20";
import { getTokenAddress } from "@/lib/tokens";
import { deriveMatchId } from "@/lib/onchain-ids";
import { depositStake } from "@/lib/stakeEscrow";
import { parseUnits } from "viem";
import type { Id } from "@convex/_generated/dataModel";

type Token = "GD" | "USDT";
type Split = "winner-take-all" | "top-3" | "top-4";

const SPLIT_TYPE: Record<Split, number> = { "winner-take-all": 0, "top-3": 1, "top-4": 2 };
const MAX_STAKED_PLAYERS = 50; // generous fixed cap — settle() uses actual playerCount, not this

export default function CreateGamePage() {
  const { address, isConnected, walletClient } = useWeb3Auth();
  const router = useRouter();
  const createInviteMatch = useMutation(api.inviteMatches.createInviteMatch);
  const recordOnChainMatch = useMutation(api.inviteMatches.recordOnChainMatch);
  const recordDeposit = useMutation(api.inviteMatches.recordDeposit);

  const [isPaid, setIsPaid] = useState(false);
  const [stakeAmount, setStakeAmount] = useState("");
  const [token, setToken] = useState<Token>("GD");
  const [split, setSplit] = useState<Split>("winner-take-all");
  const [creating, setCreating] = useState(false);
  const [chainStatus, setChainStatus] = useState<
    "idle" | "signing" | "submitting" | "approving" | "depositing" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; inviteCode: string } | null>(null);

  // Creates the match on-chain, then immediately stakes the creator's own
  // entry too — the host must put up the same stake as anyone else, otherwise
  // they'd be eligible to win a pot they never contributed to.
  async function createMatchOnChain(inviteMatchId: Id<"invite_matches">) {
    const contracts = getContractAddresses();
    if (!address || !walletClient || !contracts.stakeEscrow) return;

    const tokenAddress = getTokenAddress(token);
    const matchId = deriveMatchId(inviteMatchId);
    const decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    });
    const stakePerPlayer = parseUnits(stakeAmount, decimals);

    setChainStatus("signing");
    const { request } = await publicClient.simulateContract({
      address: contracts.stakeEscrow,
      abi: STAKE_ESCROW_ABI,
      functionName: "createMatch",
      args: [matchId, tokenAddress, stakePerPlayer, MAX_STAKED_PLAYERS, SPLIT_TYPE[split]],
      account: address as `0x${string}`,
    });

    setChainStatus("submitting");
    const createTxHash = await walletClient.writeContract(request);
    await waitForSuccess(createTxHash);
    await recordOnChainMatch({ inviteMatchId, onChainMatchId: matchId, txHash: createTxHash });

    const depositTxHash = await depositStake({
      address: address as `0x${string}`,
      walletClient,
      token,
      stakeAmount,
      matchId,
      onStatus: setChainStatus,
    });
    await recordDeposit({ inviteMatchId, playerAddress: address, txHash: depositTxHash });
    setChainStatus("done");
  }

  async function handleCreate() {
    if (!address) return;
    if (isPaid && (!stakeAmount || Number(stakeAmount) <= 0)) {
      setError("Enter how much each player stakes.");
      return;
    }
    setCreating(true);
    setError(null);
    setChainStatus("idle");
    try {
      const res = await createInviteMatch({
        creatorAddress: address,
        stakeAmount: isPaid ? stakeAmount : undefined,
        token: isPaid ? token : undefined,
        split: isPaid ? split : undefined,
      });
      if (isPaid) {
        await createMatchOnChain(res.id);
      }
      setResult(res);
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't create that game — please try again."));
    } finally {
      setCreating(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <p className="text-gray-400 font-bold">Log in to create a game.</p>
        </main>
      </div>
    );
  }

  // ── Success screen — share the invite code/link ──────────────────────────────
  if (result) {
    const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/games/${result.inviteCode}` : "";
    return (
      <div className="min-h-screen bg-white text-black flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <h1 className="text-3xl font-black">Game created!</h1>
          <p className="text-gray-500 font-semibold">Share this code with friends to play together.</p>

          <div className="card-duo px-10 py-6 text-center">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Invite code</p>
            <p className="text-4xl font-black tracking-widest text-brand-purple">{result.inviteCode}</p>
          </div>

          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="btn-duo-outline w-full max-w-sm text-sm break-all"
          >
            Copy link: {shareUrl}
          </button>

          <button
            onClick={() => router.push(`/play?invite=${result.id}`)}
            className="btn-duo-primary w-full max-w-sm text-lg"
          >
            Play now
          </button>
        </main>
      </div>
    );
  }

  // ── Create-game form ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center gap-6 p-6 pt-10">
        <h1 className="text-3xl font-black">Create a game</h1>
        <p className="text-gray-500 font-semibold text-center max-w-sm -mt-4">
          Invite friends to guess the same 5 photos and compare scores.
        </p>

        <div className="w-full max-w-sm space-y-6">
          {/* Free vs. Paid */}
          <div className="flex gap-2">
            <button
              onClick={() => setIsPaid(false)}
              className={`flex-1 py-3 rounded-2xl text-sm font-bold transition ${
                !isPaid ? "bg-brand-purple text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              Free
            </button>
            <button
              onClick={() => setIsPaid(true)}
              className={`flex-1 py-3 rounded-2xl text-sm font-bold transition ${
                isPaid ? "bg-brand-purple text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              Paid (stake G$/USDT)
            </button>
          </div>

          {isPaid && (
            <div className="card-duo p-5 space-y-5">
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wide">Stake per player</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder="10"
                    className="flex-1 bg-white text-black rounded-2xl px-4 py-3 border-2 border-gray-200 outline-none focus:border-brand-purple font-semibold"
                  />
                  <div className="flex gap-1">
                    {(["GD", "USDT"] as Token[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setToken(t)}
                        className={`px-4 rounded-2xl text-sm font-bold transition ${
                          token === t ? "bg-brand-purple text-white" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {t === "GD" ? "G$" : "USDT"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wide">Winners</label>
                <div className="flex gap-2">
                  {([
                    { v: "winner-take-all", l: "Winner takes all" },
                    { v: "top-3", l: "Top 3" },
                    { v: "top-4", l: "Top 4" },
                  ] as { v: Split; l: string }[]).map(({ v, l }) => (
                    <button
                      key={v}
                      onClick={() => setSplit(v)}
                      className={`flex-1 py-2 rounded-2xl text-xs font-bold transition ${
                        split === v ? "bg-brand-purple text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400 font-medium">
                Stakes are held in an on-chain escrow contract. You'll confirm a transaction to create the match — payouts to winners are settled separately once the game finishes.
              </p>
            </div>
          )}

          {error && <p className="text-red-500 text-sm font-semibold text-center">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating || !address}
            className="btn-duo-primary w-full text-lg"
          >
            {chainStatus === "signing"
              ? "Confirm in wallet…"
              : chainStatus === "submitting"
              ? "Creating on-chain…"
              : chainStatus === "approving"
              ? "Approve in wallet…"
              : chainStatus === "depositing"
              ? "Confirm your stake…"
              : creating
              ? "Creating…"
              : "Create Game"}
          </button>
        </div>
      </main>
    </div>
  );
}
