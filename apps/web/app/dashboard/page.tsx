"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The game screen now lives at /play.
export default function DashboardPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/play");
  }, [router]);

  return null;
}
