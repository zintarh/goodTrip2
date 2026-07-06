"use client";

import { LoginButton } from "@/components/auth/LoginButton";
import { useWeb3Auth } from "@/components/auth/Web3AuthProvider";

export default function HomePage() {
  const { isReady } = useWeb3Auth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white text-black px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <div
            className={`mx-auto w-16 h-16 rounded-2xl bg-brand-purple border-b-4 border-brand-purpleDark ${
              isReady ? "" : "animate-logo-pulse"
            }`}
          />
          <h1 className="text-5xl font-black tracking-tight">
            Good<span className="text-brand-purple">Trip</span>
          </h1>
          <p className="text-lg text-gray-500 font-semibold">
            A community geo-guessing game on the GoodDollar ecosystem.
          </p>
        </div>

        <LoginButton />

        <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">
          Built on Celo · Powered by G$
        </p>
      </div>
    </main>
  );
}
