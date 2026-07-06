"use client";

import { useEffect, useState } from "react";
import { publicClient } from "./viem-client";
import { PLAYER_REGISTRY_ABI, getContractAddresses } from "./contracts";

export function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Usernames live on-chain in PlayerRegistry (not Convex — see convex/schema.ts),
// so resolving a name is an RPC read. Cache resolved names for the page's
// lifetime and de-dupe concurrent lookups so a list of players (e.g. final
// standings) doesn't fire the same read many times.
const nameCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

async function resolveName(address: string): Promise<string> {
  const key = address.toLowerCase();
  const cached = nameCache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const lookup = (async () => {
    let display = shortAddr(address);
    const { playerRegistry } = getContractAddresses();
    if (playerRegistry) {
      try {
        const [username] = (await publicClient.readContract({
          address: playerRegistry,
          abi: PLAYER_REGISTRY_ABI,
          functionName: "getPlayer",
          args: [address as `0x${string}`],
        })) as [string, bigint];
        if (username) display = username;
      } catch {
        // Unregistered address or RPC hiccup — keep the short-address fallback.
      }
    }
    nameCache.set(key, display);
    inflight.delete(key);
    return display;
  })();

  inflight.set(key, lookup);
  return lookup;
}

// Returns the player's on-chain username, falling back to a shortened address
// until (or unless) a name resolves.
export function usePlayerName(address?: string | null): string {
  const [name, setName] = useState(address ? shortAddr(address) : "");

  useEffect(() => {
    if (!address) {
      setName("");
      return;
    }
    let active = true;
    setName(nameCache.get(address.toLowerCase()) ?? shortAddr(address));
    resolveName(address).then((n) => {
      if (active) setName(n);
    });
    return () => {
      active = false;
    };
  }, [address]);

  return name;
}
