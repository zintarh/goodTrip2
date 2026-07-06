"use client";

import dynamic from "next/dynamic";
import { ConvexClientProvider } from "./ConvexClientProvider";

// Web3Auth reads the DOM at init time — must be client-only (no SSR).
const Web3AuthProvider = dynamic(
  () => import("@/components/auth/Web3AuthProvider").then((m) => m.Web3AuthProvider),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexClientProvider>
      <Web3AuthProvider>{children}</Web3AuthProvider>
    </ConvexClientProvider>
  );
}
