"use client";

import { useState } from "react";
import { useWeb3Auth } from "./Web3AuthProvider";
import { publicClient, makeWalletClient, ensureChain } from "@/lib/viem-client";
import { PLAYER_REGISTRY_ABI, getContractAddresses } from "@/lib/contracts";
import { toFriendlyError } from "@/lib/errors";

interface Props {
  onSuccess: () => void;
}

export function RegisterModal({ onSuccess }: Props) {
  const { address, walletClient } = useWeb3Auth();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const contracts = getContractAddresses();

  function validate(name: string): string {
    if (!name) return "Username is required";
    if (name.length > 32) return "Max 32 characters";
    if (!/^[A-Za-z0-9_]+$/.test(name)) return "Only letters, numbers and underscores";
    return "";
  }

  async function handleRegister() {
    if (!address || !walletClient) return;
    if (!contracts.playerRegistry) {
      setError("Registration is temporarily unavailable — please try again shortly.");
      setStatus("error");
      return;
    }
    const validationError = validate(username);
    if (validationError) { setError(validationError); return; }

    setStatus("pending");
    setError("");
    try {
      await ensureChain(walletClient);
      const { request } = await publicClient.simulateContract({
        address: contracts.playerRegistry,
        abi: PLAYER_REGISTRY_ABI,
        functionName: "register",
        args: [username],
        account: address as `0x${string}`,
      });
      const hash = await walletClient.writeContract(request);
      setStatus("confirming"); // wallet accepted it — now waiting for the chain to confirm
      await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      setStatus("success");
      onSuccess();
    } catch (e: unknown) {
      console.error("Registration failed", e);
      // The write/receipt-wait can fail (RPC hiccup, timeout) even when the
      // transaction actually landed on-chain — check before showing an error
      // that would send the user back into a modal that just re-reverts.
      try {
        const alreadyRegistered = await publicClient.readContract({
          address: contracts.playerRegistry,
          abi: PLAYER_REGISTRY_ABI,
          functionName: "isRegistered",
          args: [address as `0x${string}`],
        }) as boolean;
        if (alreadyRegistered) {
          setStatus("success");
          onSuccess();
          return;
        }
      } catch {
        // ignore — fall through to showing the error below
      }
      setError(toFriendlyError(e, "Couldn't register that username — please try again."));
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card-duo border-b-4 p-8 w-full max-w-sm space-y-6">
        <div>
          <h2 className="text-2xl font-black">Choose a username</h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            This is how other players will see you on the leaderboard.
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            placeholder="e.g. trip_explorer"
            maxLength={32}
            className="w-full bg-white text-black rounded-2xl px-4 py-3 border-2 border-gray-200 outline-none focus:border-brand-purple placeholder-gray-400 font-semibold"
          />
          {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          {status === "confirming" && (
            <p className="text-xs text-brand-purple font-semibold">Confirming on-chain — this can take a few seconds…</p>
          )}
          <p className="text-xs text-gray-400 font-medium">Letters, numbers, underscores · max 32 chars</p>
        </div>

        <button
          onClick={handleRegister}
          disabled={!username || status === "pending" || status === "confirming"}
          className="btn-duo-primary w-full"
        >
          {status === "pending" ? "Saving…" : status === "confirming" ? "Confirming…" : "Save"}
        </button>
      </div>
    </div>
  );
}
