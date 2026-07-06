"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Navbar } from "@/components/layout/Navbar";
import { LoadingIcon } from "@/components/ui/LoadingIcon";
import { PlayerName } from "@/components/ui/PlayerName";

export default function GamesPage() {
  const router = useRouter();
  const matches = useQuery(api.inviteMatches.listActive, {});
  const [code, setCode] = useState("");

  function handleJoinByCode() {
    if (!code.trim()) return;
    router.push(`/games/${code.trim().toUpperCase()}`);
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <Navbar />
      <main className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-3xl font-black">Games</h1>

          <div className="card-duo p-5 flex gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
              placeholder="Enter invite code"
              maxLength={6}
              className="flex-1 bg-white text-black rounded-2xl px-4 py-3 border-2 border-gray-200 outline-none focus:border-brand-purple font-semibold uppercase tracking-widest"
            />
            <button onClick={handleJoinByCode} className="btn-duo-primary px-6 text-sm whitespace-nowrap">
              Join
            </button>
          </div>

          <div>
            <h2 className="text-sm text-gray-400 font-bold uppercase tracking-wide mb-3">Active games</h2>
            <div className="card-duo divide-y-2 divide-gray-100">
              {matches === undefined && (
                <div className="py-8"><LoadingIcon /></div>
              )}
              {matches?.length === 0 && (
                <p className="text-gray-400 font-semibold text-sm text-center py-8">
                  No active games yet — create one to play with friends.
                </p>
              )}
              {matches?.map((m: Doc<"invite_matches">) => (
                <button
                  key={m._id}
                  onClick={() => router.push(`/games/${m.inviteCode}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">by <PlayerName address={m.creatorAddress} /></p>
                    <p className="text-xs text-gray-400 font-semibold">
                      {m.playerAddresses.length} player{m.playerAddresses.length === 1 ? "" : "s"} joined
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    m.stakeAmount ? "bg-brand-purpleLight text-brand-purple" : "bg-gray-100 text-gray-500"
                  }`}>
                    {m.stakeAmount ? `${m.stakeAmount} ${m.token === "GD" ? "G$" : m.token}` : "Free"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
