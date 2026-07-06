"use client";

import { useWeb3Auth } from "./Web3AuthProvider";
import { useRouter } from "next/navigation";
import { LoadingIcon } from "@/components/ui/LoadingIcon";

export function LoginButton() {
  const { login, isReady, isConnected, initError } = useWeb3Auth();
  const router = useRouter();

  async function handleLogin() {
    const authed = await login();
    if (authed) router.push("/play");
  }

  if (isConnected) {
    return (
      <button
        onClick={() => router.push("/play")}
        className="btn-duo-primary w-full text-lg"
      >
        Go to GoodTrip
      </button>
    );
  }

  if (initError) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-red-500">
          Couldn't reach Web3Auth — check your network connection (or disable any ad blocker/VPN) and try again.
        </p>
        <button onClick={() => window.location.reload()} className="btn-duo-outline w-full text-lg">
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleLogin}
      disabled={!isReady}
      className="btn-duo-primary w-full text-lg disabled:cursor-wait flex items-center justify-center"
    >
      {isReady ? "Play with Email / Google" : <LoadingIcon size={22} />}
    </button>
  );
}
