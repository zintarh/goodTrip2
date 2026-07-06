"use client";

import { usePlayerName } from "@/lib/usernames";

// Renders a player's on-chain username (from PlayerRegistry), falling back to a
// shortened address. Use this anywhere a raw wallet address would otherwise be
// shown to a user.
export function PlayerName({ address, isYou }: { address: string; isYou?: boolean }) {
  const name = usePlayerName(address);
  return (
    <>
      {name}
      {isYou ? " (you)" : ""}
    </>
  );
}
