"use client";

import { Navbar } from "@/components/layout/Navbar";

export default function SubmitPage() {
  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-black">Community Submissions</h1>
        <p className="text-gray-500 font-semibold max-w-sm">
          Community photo submissions are coming in v2. For now, all locations are sourced from Mapillary.
        </p>
      </main>
    </div>
  );
}
