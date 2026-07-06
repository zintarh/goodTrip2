"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useWeb3Auth } from "@/components/auth/Web3AuthProvider";

const NAV_LINKS = [
  { href: "/play", label: "Play", shortLabel: "Play", Icon: PlayIcon },
  { href: "/games", label: "Games", shortLabel: "Games", Icon: GamesIcon },
  { href: "/create-game", label: "Create Game", shortLabel: "Create", Icon: CreateIcon },
  { href: "/leaderboard", label: "Leaderboard", shortLabel: "Ranks", Icon: RanksIcon },
];

export function Navbar({ hideMobileTabBar = false }: { hideMobileTabBar?: boolean }) {
  const { logout, isConnected } = useWeb3Auth();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <>
      <nav className="shrink-0 bg-white border-b-2 border-gray-100 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="font-black text-lg mr-3 self-center tracking-tight">
            Good<span className="text-brand-purple">Trip</span>
          </span>
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-full text-sm font-bold transition ${
                  pathname === href
                    ? "bg-brand-purpleLight text-brand-purple"
                    : "text-gray-400 hover:text-black hover:bg-gray-50"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        {isConnected && (
          <button
            onClick={handleLogout}
            className="text-xs font-bold text-gray-400 hover:text-black transition px-3 py-1.5 rounded-full hover:bg-gray-50"
          >
            Logout
          </button>
        )}
      </nav>

      {!hideMobileTabBar && (
        <nav
          className="md:hidden order-last shrink-0 bg-white border-t-2 border-gray-100 flex items-stretch justify-around pt-1"
          style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
        >
          {NAV_LINKS.map(({ href, shortLabel, Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className="flex-1 flex flex-col items-center justify-center py-1">
                <span
                  className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl transition ${
                    active ? "bg-brand-purpleLight text-brand-purple" : "text-gray-400"
                  }`}
                >
                  <Icon />
                  <span className="text-[10px] font-bold leading-none">{shortLabel}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function GamesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function RanksIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 20V13M12 20V6M18 20v-9" />
    </svg>
  );
}
