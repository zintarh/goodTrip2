"use client";

import dynamic from "next/dynamic";
import { useWeb3Auth } from "@/components/auth/Web3AuthProvider";
import { Navbar } from "@/components/layout/Navbar";
import { RegisterModal } from "@/components/auth/RegisterModal";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { publicClient, waitForSuccess, ensureChain } from "@/lib/viem-client";
import { PLAYER_REGISTRY_ABI, SCORE_REGISTRY_ABI, getContractAddresses } from "@/lib/contracts";
import { ERC20_ABI } from "@/lib/erc20";
import { getTokenAddress } from "@/lib/tokens";
import { formatUnits, parseUnits } from "viem";
import { useGoodDollarClaim } from "@/components/auth/useGoodDollarClaim";
import { toFriendlyError } from "@/lib/errors";
import { TravelerAnimation } from "@/components/ui/TravelerAnimation";
import { LoadingIcon } from "@/components/ui/LoadingIcon";
import confetti from "canvas-confetti";

const GuessMap = dynamic(() => import("@/components/game/GuessMap"), { ssr: false });

const ROUND_MAX_SCORE = 500; // matches calcScore's max in convex/games.ts
const CONFETTI_COLORS = ["#7C3AED", "#A78BFA", "#F5F0FF", "#FFD700"];

function celebrateRound(ratio: number) {
  confetti({
    particleCount: Math.round(40 + ratio * 120),
    spread: 70 + ratio * 30,
    startVelocity: 35,
    origin: { y: 0.7 },
    colors: CONFETTI_COLORS,
  });
}

function celebrateGameComplete() {
  confetti({ particleCount: 120, spread: 100, startVelocity: 45, origin: { y: 0.6 }, colors: CONFETTI_COLORS });
  setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 }, colors: CONFETTI_COLORS }), 200);
  setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, colors: CONFETTI_COLORS }), 200);
}

type RoundState = "guessing" | "revealed" | "complete";

export default function PlayPage() {
  const { address, isReady, isConnected, walletClient, addressError } = useWeb3Auth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteMatchId = searchParams.get("invite") as Id<"invite_matches"> | null;
  const contracts = getContractAddresses();
  const goodDollar = useGoodDollarClaim();
  const streakInfo = useQuery(api.streaks.getStreakInfo, address ? { playerAddress: address } : "skip");
  const buyStreakFreeze = useMutation(api.streaks.purchaseStreakFreeze);

  // ── Profile (all-time, from chain) ───────────────────────────────────────────
  const [username, setUsername]         = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  // ── Game session state ───────────────────────────────────────────────────────
  const [gameId, setGameId]             = useState<Id<"games"> | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [roundState, setRoundState]     = useState<RoundState>("guessing");
  const [lastResult, setLastResult]     = useState<{
    score: number; distanceKm: number;
    answerLat: number; answerLng: number; placeName: string;
    totalScore?: number;
  } | null>(null);
  const [sessionScore, setSessionScore] = useState(0);
  const [pin, setPin]                   = useState<{ lat: number; lng: number } | null>(null);
  const [mapExpanded, setMapExpanded]   = useState(false);
  const [imgZoom, setImgZoom]           = useState(1); // 1 = fit, up to 3 = 3x zoomed in
  const [chainStatus, setChainStatus]   = useState<"idle" | "signing" | "submitting" | "done" | "error">("idle");
  const [chainError, setChainError]     = useState<string | null>(null);

  const createGame       = useMutation(api.games.createGame);
  const createInviteGame = useMutation(api.games.createGameFromInviteMatch);
  const submitGuess      = useMutation(api.games.submitGuess);
  const getVoucher       = useAction(api.vouchers.getScoreVoucher);
  const game        = useQuery(api.games.getGame, gameId ? { gameId } : "skip");

  const currentRoundData = game?.rounds?.find(
    (r: { roundNumber: number; locationId: string }) => r.roundNumber === currentRound
  );
  const locationId = currentRoundData?.locationId as Id<"locations"> | undefined;
  const location   = useQuery(api.locations.getLocationForRound,
    locationId ? { locationId, gameId: gameId! } : "skip"
  );

  useEffect(() => {
    if (isReady && !isConnected) router.push("/");
  }, [isReady, isConnected, router]);

  useEffect(() => {
    if (!address || !isConnected) return;
    loadProfile(address as `0x${string}`);
  }, [address, isConnected, contracts.playerRegistry, contracts.scoreRegistry]);

  // Arriving via an invite link (?invite=<matchId>) — jump straight into that
  // match's shared 5 locations instead of the "Ready to play?" hero screen.
  useEffect(() => {
    if (!inviteMatchId || !address || gameId) return;
    createInviteGame({ inviteMatchId, playerAddress: address }).then((id) => {
      setGameId(id);
      setCurrentRound(1);
      setRoundState("guessing");
      setSessionScore(0);
      setPin(null);
      setLastResult(null);
      setChainStatus("idle");
      setChainError(null);
      setMapExpanded(false);
      setImgZoom(1);
    });
  }, [inviteMatchId, address, gameId, createInviteGame]);

  async function loadProfile(addr: `0x${string}`) {
    try {
      if (contracts.playerRegistry) {
        const [name, registeredAt] = await publicClient.readContract({
          address: contracts.playerRegistry,
          abi: PLAYER_REGISTRY_ABI,
          functionName: "getPlayer",
          args: [addr],
        }) as [string, bigint];

        if (registeredAt === 0n) {
          setShowRegister(true);
        } else {
          setUsername(name);
          setShowRegister(false);
        }
      }
    } catch {
      // Contract not deployed yet — show placeholders
    }
  }

  async function startGame() {
    if (!address) return;
    const id = await createGame({ playerAddress: address, mode: "random" });
    setGameId(id);
    setCurrentRound(1);
    setRoundState("guessing");
    setSessionScore(0);
    setPin(null);
    setLastResult(null);
    setChainStatus("idle");
    setChainError(null);
    setMapExpanded(false);
    setImgZoom(1);
  }

  async function handleConfirm() {
    if (!pin || !gameId || roundState !== "guessing") return;
    const result = await submitGuess({
      gameId,
      roundNumber: currentRound,
      guessLat: pin.lat,
      guessLng: pin.lng,
    });
    setLastResult(result);
    setSessionScore((s) => s + result.score);

    if (result.gameComplete) {
      setRoundState("complete");
      celebrateGameComplete();
    } else {
      setRoundState("revealed");
      // Reveal happens in place, in the same widget as the Guess button —
      // no auto-expand/reposition into a separate modal-like overlay.
      celebrateRound(result.score / ROUND_MAX_SCORE);
    }
  }

  // Off-chain (Convex) score is already saved after every round via submitGuess
  // above. On-chain recording happens once, for the whole 5-round game, and
  // only when the player explicitly clicks "Submit score on-chain" — signing
  // a wallet transaction after every single round would be too much friction.
  async function submitScoreOnChain(gId: Id<"games">) {
    if (!address || !walletClient || !contracts.scoreRegistry) return;
    try {
      setChainStatus("signing");
      const voucher = await getVoucher({ gameId: gId, playerAddress: address });

      setChainStatus("submitting");
      await ensureChain(walletClient);
      const { request } = await publicClient.simulateContract({
        address: contracts.scoreRegistry,
        abi: SCORE_REGISTRY_ABI,
        functionName: "submitScore",
        args: [voucher.gameIdBytes32 as `0x${string}`, BigInt(voucher.totalScore), voucher.signature as `0x${string}`],
        account: address as `0x${string}`,
      });
      const txHash = await walletClient.writeContract(request);
      await waitForSuccess(txHash);
      setChainStatus("done");
    } catch (e) {
      console.error("On-chain score submission failed", e);
      setChainError(toFriendlyError(e, "Couldn't record your score on-chain — please try again."));
      setChainStatus("error");
    }
  }

  // Sends the actual G$ payment to the treasury before recording the purchase —
  // without this, purchaseStreakFreeze had no way to know a payment ever happened.
  async function buyFreezeOnChain() {
    if (!address || !walletClient) throw new Error("Connect your wallet first.");
    const treasury = process.env.NEXT_PUBLIC_TREASURY_ADDRESS as `0x${string}` | undefined;
    if (!treasury) throw new Error("Treasury address isn't configured for this network yet.");

    const tokenAddress = getTokenAddress("GD");
    const decimals = await publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" });
    const amount = parseUnits(streakInfo?.freezeCostGD ?? "20", decimals);

    await ensureChain(walletClient);
    const { request } = await publicClient.simulateContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [treasury, amount],
      account: address as `0x${string}`,
    });
    const txHash = await walletClient.writeContract(request);
    await waitForSuccess(txHash);
    return buyStreakFreeze({ playerAddress: address, txHash });
  }

  function nextRound() {
    setCurrentRound((r) => r + 1);
    setRoundState("guessing");
    setPin(null);
    setLastResult(null);
    setMapExpanded(false);
    setImgZoom(1);
  }

  if (!isReady || !isConnected) return null;

  // ── Registration gate ────────────────────────────────────────────────────────
  if (showRegister) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col">
        <Navbar />
        <RegisterModal onSuccess={() => {
          setShowRegister(false);
          if (address) loadProfile(address as `0x${string}`);
        }} />
      </div>
    );
  }

  // ── Joining an invite match — brief loading state instead of the hero screen ──
  if (inviteMatchId && !gameId) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center gap-3">
          <TravelerAnimation />
          <p className="text-gray-400 font-bold">Packing your bags…</p>
        </main>
      </div>
    );
  }

  // ── No game started — hero / stats screen ────────────────────────────────────
  if (!gameId) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
          <TravelerAnimation />

          <div className="text-center space-y-1 -mt-2">
            <h1 className="text-3xl font-black">
              {username ? `Welcome back, @${username}` : "Ready to play?"}
            </h1>
            <p className="text-gray-500 font-semibold">
              You'll see 5 photos. Drop a pin where you think each was taken.
            </p>
          </div>

          <button
            onClick={startGame}
            disabled={!address}
            className="btn-duo-primary w-full max-w-sm text-lg"
          >
            {address ? "Play" : "Connect wallet to play"}
          </button>

          {!address && isConnected && (
            <p className="text-xs text-red-400 font-medium break-all max-w-sm text-center">
              Debug: connected but no address resolved{addressError ? ` — ${addressError}` : " (no error thrown)"}
            </p>
          )}
        </main>
      </div>
    );
  }

  // ── Game complete ────────────────────────────────────────────────────────────
  if (roundState === "complete") {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <h1 className="text-3xl font-black">Trip complete!</h1>
          <p className="text-6xl font-black text-brand-purple">{sessionScore.toLocaleString()}</p>
          <p className="text-gray-500 font-semibold">out of 2,500 points</p>

          <div className="w-full max-w-sm space-y-3 text-center font-semibold">
            {chainStatus === "idle" && (
              <button onClick={() => gameId && submitScoreOnChain(gameId)} className="btn-duo-outline w-full">
                Submit score on-chain
              </button>
            )}
            {chainStatus === "signing"    && <p className="text-gray-400 text-sm">Confirm in your wallet…</p>}
            {chainStatus === "submitting" && <p className="text-gray-400 text-sm">Recording score on Celo…</p>}
            {chainStatus === "done"       && <p className="text-brand-purple text-sm">Score recorded on-chain ✓</p>}
            {chainStatus === "error" && (
              <>
                <p className="text-red-500 text-sm">{chainError ?? "Couldn't record your score on-chain — please try again."}</p>
                <button onClick={() => gameId && submitScoreOnChain(gameId)} className="btn-duo-outline w-full">
                  Retry
                </button>
              </>
            )}
          </div>

          <button onClick={startGame} className="btn-duo-primary text-lg px-10">
            Play again
          </button>
        </main>
      </div>
    );
  }

  // ── Active round — full-bleed photo with corner map ──────────────────────────
  return (
    <div className="h-screen flex flex-col bg-white text-black overflow-hidden">
      <Navbar hideMobileTabBar />

      <div className="relative flex-1 min-h-0 bg-gray-100">
        {location?.imageUrl ? (
          <div
            className="absolute inset-0 overflow-auto"
            onDoubleClick={() => setImgZoom((z) => (z > 1 ? 1 : 2))}
          >
            <img
              src={location.imageUrl}
              alt="Guess where this was taken"
              style={{ transform: imgZoom > 1 ? `scale(${imgZoom})` : undefined }}
              className={`w-full h-full object-cover transition-transform duration-300 ${
                imgZoom > 1 ? "cursor-zoom-out" : "cursor-zoom-in"
              }`}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><LoadingIcon /></div>
        )}

        {/* Photo zoom controls — same +/- style as the map's zoom control */}
        <div className="absolute top-3 left-3 z-20 flex flex-col rounded-lg overflow-hidden border border-gray-300 bg-white shadow-md">
          <button
            onClick={() => setImgZoom((z) => Math.min(3, z + 0.5))}
            disabled={imgZoom >= 3}
            aria-label="Zoom in on photo"
            className="w-11 h-11 flex items-center justify-center text-2xl font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-30 border-b border-gray-300 leading-none"
          >
            +
          </button>
          <button
            onClick={() => setImgZoom((z) => Math.max(1, z - 0.5))}
            disabled={imgZoom <= 1}
            aria-label="Zoom out on photo"
            className="w-11 h-11 flex items-center justify-center text-2xl font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-30 leading-none"
          >
            −
          </button>
        </div>

        {/* Top overlay: round pips (center) + running total (small, far right) */}
        <div className="absolute top-6 inset-x-3 z-20 flex items-center justify-center pointer-events-none">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className={`w-7 h-2 rounded-full ${
                n < currentRound ? "bg-brand-purple" : n === currentRound ? "bg-white" : "bg-white/40"
              }`} />
            ))}
          </div>
          <div className="absolute right-0 bg-black/70 text-white px-4 py-2 rounded-full">
            <span className="text-lg font-black">{sessionScore}</span>
            <span className="text-xs font-bold text-white/60"> pts</span>
          </div>
        </div>

        {/* Reward moment: this round's score, revealed big and dead-center so it reads as the payoff */}
        {roundState === "revealed" && lastResult && (
          <div
            key={currentRound}
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-score-pop"
          >
            <div className="bg-black/75 text-white px-8 py-4 rounded-3xl text-center shadow-2xl">
              <span className="text-6xl font-black text-white">{lastResult.score}</span>
              <span className="text-lg font-bold text-white/60"> / {ROUND_MAX_SCORE}</span>
            </div>
          </div>
        )}

        {location?.mapillaryId && (
          <a
            href={`https://www.mapillary.com/app/?image_key=${location.mapillaryId}`}
            target="_blank" rel="noopener noreferrer"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 text-[10px] font-semibold text-white/70 hover:text-white"
          >
            © Mapillary contributors
          </a>
        )}

        {/* Map widget — bottom-right, with the guess/result bar built onto it.
            The reveal (answer pin + distance line) shows in this same widget,
            in place — it never jumps to a separate modal. The expand icon is
            still there if someone wants it bigger still. */}
        <div
          className={`fixed z-30 rounded-3xl overflow-hidden border-4 border-black shadow-2xl bg-white transition-all duration-300 ease-out flex flex-col ${
            mapExpanded
              ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] h-[55vh] max-w-4xl"
              : "bottom-4 right-4 w-[calc(100vw-2rem)] h-[65vw] max-w-[820px] max-h-[65vh] sm:w-[860px] sm:h-[480px]"
          }`}
        >
          <button
            onClick={() => setMapExpanded((e) => !e)}
            aria-label={mapExpanded ? "Collapse map" : "Expand map"}
            className="absolute top-2 right-2 z-40 w-8 h-8 rounded-full bg-white border-2 border-black flex items-center justify-center text-sm font-black leading-none"
          >
            {mapExpanded ? "✕" : "⤡"}
          </button>

          <div className="relative flex-1 min-h-0">
            <GuessMap
              key={currentRound}
              onGuess={setPin}
              disabled={roundState !== "guessing"}
              compact={!mapExpanded}
              answerPin={roundState === "revealed" && lastResult
                ? { lat: lastResult.answerLat, lng: lastResult.answerLng }
                : undefined}
            />
          </div>

          {/* Guess bar — built onto the map itself */}
          {roundState === "guessing" && (
            <div className="shrink-0 z-40 bg-white border-t-2 border-black p-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-gray-500 truncate hidden sm:inline">
                {pin ? `${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}` : "Tap the map to place your pin"}
              </span>
              <button
                disabled={!pin}
                onClick={handleConfirm}
                className="btn-duo-primary py-3.5 px-8 text-lg whitespace-nowrap flex-1 sm:flex-none"
              >
                Guess
              </button>
            </div>
          )}

          {/* Result bar — built onto the map itself. The place name is the
              educational payoff, so it gets full-width, bold, prominent text
              rather than being squeezed next to the button. */}
          {roundState === "revealed" && lastResult && (
            <div className="shrink-0 z-40 bg-white border-t-2 border-black p-3 space-y-2.5">
              <p className="text-base sm:text-lg font-bold text-gray-700 leading-snug">
                <span className="font-black text-brand-purple">+{lastResult.score} pts</span>
                {" — "}
                {lastResult.distanceKm < 1
                  ? `${(lastResult.distanceKm * 1000).toFixed(0)} m`
                  : `${lastResult.distanceKm.toFixed(1)} km`}{" "}
                from <span className="font-black text-black">{lastResult.placeName}</span>
              </p>
              <button onClick={nextRound} className="btn-duo-primary w-full py-3.5 text-lg">
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function StreakCard({
  info,
  onBuyFreeze,
}: {
  info: { currentStreak: number; longestStreak: number; streakFreezes: number; playedToday: boolean; freezeCostGD: string } | undefined;
  onBuyFreeze: () => Promise<unknown>;
}) {
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setBuying(true);
    setError(null);
    try {
      await onBuyFreeze();
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't buy a streak freeze — please try again."));
    } finally {
      setBuying(false);
    }
  }

  if (!info) {
    return (
      <div className="card-duo px-5 py-4 w-full max-w-sm text-center">
        <LoadingIcon size={32} />
      </div>
    );
  }

  return (
    <div className="card-duo px-5 py-4 w-full max-w-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-black">
            🔥 {info.currentStreak}
            <span className="text-sm font-bold text-gray-400"> day{info.currentStreak === 1 ? "" : "s"}</span>
          </p>
          {info.longestStreak > info.currentStreak && (
            <p className="text-xs text-gray-400 font-semibold">Best: {info.longestStreak}</p>
          )}
        </div>
        {info.streakFreezes > 0 && (
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-brand-purpleLight text-brand-purple">
            🧊 ×{info.streakFreezes}
          </span>
        )}
      </div>

      <button onClick={handleBuy} disabled={buying} className="btn-duo-outline w-full text-sm">
        {buying ? "Confirm in wallet…" : `Buy a streak freeze (${info.freezeCostGD} G$)`}
      </button>
      <p className="text-xs text-gray-400 font-medium text-center">
        Auto-protects your streak if you miss a day.
      </p>

      {error && <p className="text-xs text-red-500 font-semibold text-center">{error}</p>}
    </div>
  );
}

function GoodDollarClaimCard(props: ReturnType<typeof useGoodDollarClaim>) {
  const { isMainnet: onMainnet, loading, status, claiming, verifying, error, claim, startVerification } = props;

  if (!onMainnet) {
    return (
      <div className="card-duo px-5 py-4 w-full max-w-sm text-center">
        <p className="text-sm text-gray-400 font-semibold">
          Switch to Celo Mainnet to claim your daily G$ UBI — GoodDollar's UBI only exists there, not on testnet.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card-duo px-5 py-4 w-full max-w-sm text-center">
        <LoadingIcon size={32} />
      </div>
    );
  }

  return (
    <div className="card-duo px-5 py-4 w-full max-w-sm space-y-3 text-center">
      {status?.status === "not_whitelisted" && (
        <>
          <p className="text-sm text-gray-500 font-semibold">
            Verify your identity with GoodDollar to claim your daily G$ UBI.
          </p>
          <button onClick={startVerification} className="btn-duo-outline w-full">
            {verifying ? "Waiting for verification…" : "Verify & whitelist"}
          </button>
        </>
      )}

      {status?.status === "can_claim" && (
        <button onClick={claim} disabled={claiming} className="btn-duo-outline w-full">
          {claiming ? "Claiming…" : `Claim ${formatUnits(status.entitlement, 18)} G$`}
        </button>
      )}

      {status?.status === "already_claimed" && (
        <p className="text-sm text-gray-500 font-semibold">
          Already claimed today — come back{" "}
          {status.nextClaimTime ? `at ${status.nextClaimTime.toLocaleTimeString()}` : "tomorrow"}.
        </p>
      )}

      {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
    </div>
  );
}
