"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { Navbar } from "@/components/layout/Navbar";
import { useWeb3Auth } from "@/components/auth/Web3AuthProvider";
import { toFriendlyError } from "@/lib/errors";
import { deriveMatchId } from "@/lib/onchain-ids";
import { depositStake } from "@/lib/stakeEscrow";
import { publicClient, waitForSuccess, ensureChain } from "@/lib/viem-client";
import { STAKE_ESCROW_ABI, getContractAddresses } from "@/lib/contracts";
import { ERC20_ABI } from "@/lib/erc20";
import { getTokenAddress } from "@/lib/tokens";
import { formatUnits } from "viem";
import { LoadingIcon } from "@/components/ui/LoadingIcon";
import { PlayerName } from "@/components/ui/PlayerName";

export default function JoinGamePage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const router = useRouter();
  const { address, isConnected, walletClient } = useWeb3Auth();

  const match = useQuery(api.inviteMatches.getByCode, { inviteCode: code });
  const join = useMutation(api.inviteMatches.join);
  const recordDeposit = useMutation(api.inviteMatches.recordDeposit);
  const deleteMatch = useMutation(api.inviteMatches.deleteMatch);
  const leaveMatch = useMutation(api.inviteMatches.leaveMatch);
  const recordSettlement = useMutation(api.inviteMatches.recordSettlement);
  const getSettlementVoucher = useAction(api.vouchers.getMatchSettlementVoucher);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [chainStatus, setChainStatus] = useState<"idle" | "approving" | "depositing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [claimable, setClaimable] = useState<{ amount: bigint; decimals: number } | null>(null);

  const alreadyIn = !!(address && match?.playerAddresses.includes(address));
  const isHost = !!(address && match && address === match.creatorAddress);
  const canLeaveOrDelete = !!(match && !match.stakeAmount);
  const isStaked = !!match?.stakeAmount;

  const completionStatus = useQuery(
    api.inviteMatches.getMatchCompletionStatus,
    match && isStaked && alreadyIn && !match.isSettled ? { inviteMatchId: match._id } : "skip"
  );

  useEffect(() => {
    if (!match || !isStaked || !match.isSettled || !address) { setClaimable(null); return; }
    const contracts = getContractAddresses();
    if (!contracts.stakeEscrow || !match.onChainMatchId || !match.token) return;
    const tokenAddress = getTokenAddress(match.token);
    (async () => {
      const [amount, decimals] = await Promise.all([
        publicClient.readContract({
          address: contracts.stakeEscrow!,
          abi: STAKE_ESCROW_ABI,
          functionName: "claimable",
          args: [match.onChainMatchId as `0x${string}`, address as `0x${string}`],
        }),
        publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }),
      ]);
      setClaimable({ amount, decimals });
    })().catch(() => setClaimable(null));
  }, [match?.isSettled, match?.onChainMatchId, match?.token, address, isStaked]);

  async function handleSettle() {
    if (!address || !walletClient || !match) return;
    const contracts = getContractAddresses();
    if (!contracts.stakeEscrow) return;
    setSettling(true);
    setError(null);
    try {
      const voucher = await getSettlementVoucher({ inviteMatchId: match._id });
      await ensureChain(walletClient);
      const { request } = await publicClient.simulateContract({
        address: contracts.stakeEscrow,
        abi: STAKE_ESCROW_ABI,
        functionName: "settle",
        args: [voucher.matchId, voucher.rankedPlayers as `0x${string}`[], voucher.signature as `0x${string}`],
        account: address as `0x${string}`,
      });
      const txHash = await walletClient.writeContract(request);
      await waitForSuccess(txHash);
      await recordSettlement({ inviteMatchId: match._id, rankedPlayers: voucher.rankedPlayers, txHash });
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't settle this match — please try again."));
    } finally {
      setSettling(false);
    }
  }

  async function handleClaim() {
    if (!address || !walletClient || !match?.onChainMatchId) return;
    const contracts = getContractAddresses();
    if (!contracts.stakeEscrow) return;
    setClaiming(true);
    setError(null);
    try {
      await ensureChain(walletClient);
      const { request } = await publicClient.simulateContract({
        address: contracts.stakeEscrow,
        abi: STAKE_ESCROW_ABI,
        functionName: "claim",
        args: [match.onChainMatchId as `0x${string}`],
        account: address as `0x${string}`,
      });
      const txHash = await walletClient.writeContract(request);
      await waitForSuccess(txHash);
      setClaimable({ amount: 0n, decimals: claimable?.decimals ?? 18 });
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't claim your winnings — please try again."));
    } finally {
      setClaiming(false);
    }
  }

  async function handleDelete() {
    if (!address || !match) return;
    if (!window.confirm("Delete this game? This can't be undone.")) return;
    setLeaving(true);
    setError(null);
    try {
      await deleteMatch({ inviteMatchId: match._id, requesterAddress: address });
      router.push("/games");
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't delete that game — please try again."));
    } finally {
      setLeaving(false);
    }
  }

  async function handleLeave() {
    if (!address || !match) return;
    setLeaving(true);
    setError(null);
    try {
      await leaveMatch({ inviteMatchId: match._id, playerAddress: address });
      router.push("/games");
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't leave that game — please try again."));
    } finally {
      setLeaving(false);
    }
  }

  async function depositOnChain() {
    if (!address || !walletClient || !match?.stakeAmount || !match.token) return;
    const matchId = (match.onChainMatchId as `0x${string}` | undefined) ?? deriveMatchId(match._id);

    const txHash = await depositStake({
      address: address as `0x${string}`,
      walletClient,
      token: match.token,
      stakeAmount: match.stakeAmount,
      matchId,
      onStatus: setChainStatus,
    });
    await recordDeposit({ inviteMatchId: match._id, playerAddress: address, txHash });
  }

  async function handleJoin() {
    if (!address || !match) return;
    setJoining(true);
    setError(null);
    setChainStatus("idle");
    try {
      if (match.stakeAmount) {
        await depositOnChain();
      }
      await join({ inviteCode: code, playerAddress: address });
      router.push(`/play?invite=${match._id}`);
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't join that game — please try again."));
    } finally {
      setJoining(false);
      setChainStatus("idle");
    }
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        {match === undefined && <LoadingIcon />}

        {match === null && (
          <>
            <h1 className="text-2xl font-black">Game not found</h1>
            <p className="text-gray-500 font-semibold text-center max-w-sm">
              Double-check the code — it might be mistyped, or the game may have ended.
            </p>
          </>
        )}

        {match && (
          <>
            <h1 className="text-3xl font-black tracking-widest text-brand-purple">{code}</h1>
            <div className="card-duo px-8 py-5 text-center space-y-1">
              <p className="font-bold">Hosted by <PlayerName address={match.creatorAddress} /></p>
              <p className="text-sm text-gray-500 font-semibold">
                {match.stakeAmount ? `${match.stakeAmount} ${match.token === "GD" ? "G$" : match.token} stake` : "Free to play"}
                {" · "}
                {match.playerAddresses.length} player{match.playerAddresses.length === 1 ? "" : "s"} joined
              </p>
            </div>

            {error && <p className="text-red-500 text-sm font-semibold text-center">{error}</p>}

            {!isConnected ? (
              <p className="text-gray-400 font-bold">Log in to join this game.</p>
            ) : alreadyIn ? (
              <div className="w-full max-w-sm space-y-3">
                <button onClick={() => router.push(`/play?invite=${match._id}`)} className="btn-duo-primary w-full text-lg">
                  Play
                </button>
                {canLeaveOrDelete && isHost && (
                  <button onClick={handleDelete} disabled={leaving} className="w-full text-sm font-bold text-red-500 hover:text-red-600 transition">
                    {leaving ? "Deleting…" : "Delete game"}
                  </button>
                )}
                {canLeaveOrDelete && !isHost && (
                  <button onClick={handleLeave} disabled={leaving} className="w-full text-sm font-bold text-red-500 hover:text-red-600 transition">
                    {leaving ? "Leaving…" : "Leave game"}
                  </button>
                )}
                {!canLeaveOrDelete && (
                  <p className="text-xs text-gray-400 font-medium text-center">
                    Staked games can't be left or deleted — stakes are locked in escrow.
                  </p>
                )}

                {isStaked && !match.isSettled && completionStatus && !completionStatus.allComplete && (
                  <p className="text-xs text-gray-400 font-medium text-center">
                    Waiting on {completionStatus.players.filter((p: { isComplete: boolean }) => !p.isComplete).length} more player
                    {completionStatus.players.filter((p: { isComplete: boolean }) => !p.isComplete).length === 1 ? "" : "s"} to finish before this match can settle.
                  </p>
                )}

                {isStaked && !match.isSettled && completionStatus?.allComplete && (
                  <button onClick={handleSettle} disabled={settling} className="w-full text-sm font-bold text-brand-purple hover:text-brand-purpleDark transition">
                    {settling ? "Settling…" : "Settle match & determine winners"}
                  </button>
                )}

                {isStaked && match.isSettled && match.rankedPlayers && (
                  <div className="card-duo p-4 space-y-2">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wide text-center">Final standings</p>
                    {match.rankedPlayers.map((addr: string, i: number) => (
                      <p key={addr} className={`text-sm font-bold ${addr === address ? "text-brand-purple" : ""}`}>
                        #{i + 1} <PlayerName address={addr} isYou={addr === address} />
                      </p>
                    ))}
                  </div>
                )}

                {isStaked && match.isSettled && claimable && claimable.amount > 0n && (
                  <button onClick={handleClaim} disabled={claiming} className="btn-duo-primary w-full text-lg">
                    {claiming ? "Claiming…" : `Claim ${formatUnits(claimable.amount, claimable.decimals)} ${match.token === "GD" ? "G$" : match.token}`}
                  </button>
                )}
              </div>
            ) : (
              <button onClick={handleJoin} disabled={joining} className="btn-duo-primary w-full max-w-sm text-lg">
                {chainStatus === "approving"
                  ? "Approve in wallet…"
                  : chainStatus === "depositing"
                  ? "Confirm stake in wallet…"
                  : joining
                  ? "Joining…"
                  : match.stakeAmount
                  ? "Stake & Join"
                  : "Join Game"}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
