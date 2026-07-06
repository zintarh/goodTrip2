"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IdentitySDK, ClaimSDK, type WalletClaimStatus } from "@goodsdks/citizen-sdk";
import { useWeb3Auth } from "./Web3AuthProvider";
import { publicClient } from "@/lib/viem-client";
import { toFriendlyError } from "@/lib/errors";

// GoodDollar's UBI/identity contracts only exist on Celo Mainnet — there is
// no testnet deployment to claim from, so this is intentionally hardcoded
// regardless of which network the rest of the app (game contracts) targets.
const CELO_MAINNET_ID = 42220;
const isMainnet = process.env.NEXT_PUBLIC_CELO_NETWORK === "mainnet";

export function useGoodDollarClaim() {
  const { address, walletClient, isConnected } = useWeb3Auth();
  const [status, setStatus] = useState<WalletClaimStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identitySDK = useMemo(() => {
    if (!isMainnet || !isConnected || !address || !walletClient) return null;
    return new IdentitySDK({
      account: address as `0x${string}`,
      publicClient: publicClient as never,
      walletClient: walletClient as never,
      env: "production",
    });
  }, [address, walletClient, isConnected]);

  const claimSDK = useMemo(() => {
    if (!identitySDK || !address || !walletClient) return null;
    return new ClaimSDK({
      account: address as `0x${string}`,
      publicClient: publicClient as never,
      walletClient: walletClient as never,
      identitySDK,
      env: "production",
    });
  }, [identitySDK, address, walletClient]);

  const refresh = useCallback(async () => {
    if (!claimSDK) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setStatus(await claimSDK.getWalletClaimStatus());
      setError(null);
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't check your claim status — please try again."));
    }
    setLoading(false);
  }, [claimSDK]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // While the face-verification tab is open, poll for whitelist status so the
  // UI updates on its own once the user finishes verifying.
  useEffect(() => {
    if (!verifying || !claimSDK) return;
    const interval = setInterval(async () => {
      const next = await claimSDK.getWalletClaimStatus().catch(() => null);
      if (next && next.status !== "not_whitelisted") {
        setStatus(next);
        setVerifying(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [verifying, claimSDK]);

  async function startVerification() {
    if (!identitySDK) return;
    setError(null);
    try {
      const link = await identitySDK.generateFVLink(false, window.location.href, CELO_MAINNET_ID);
      window.open(link, "_blank", "noopener,noreferrer");
      setVerifying(true);
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't start verification — please try again."));
    }
  }

  async function claim() {
    if (!claimSDK) return;
    setClaiming(true);
    setError(null);
    try {
      await claimSDK.claim();
      await refresh();
    } catch (e) {
      setError(toFriendlyError(e, "Couldn't complete your claim — please try again."));
    } finally {
      setClaiming(false);
    }
  }

  return { isMainnet, loading, status, claiming, verifying, error, claim, startVerification };
}
