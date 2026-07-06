// Hand-built animated traveler — a walking-bob figure with a rolling
// suitcase (spinning wheel spokes). No third-party Lottie asset: LottieFiles
// blocks automated fetching, and hotlinking a guessed CDN URL risks a broken
// embed in production, so this is a small dependency-free SVG instead.
export function TravelerAnimation({ size = 112 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className="animate-walk-bob select-none"
      aria-hidden
    >
      {/* ground shadow */}
      <ellipse cx="60" cy="108" rx="34" ry="6" fill="#00000012" />

      {/* suitcase */}
      <rect x="80" y="66" width="28" height="24" rx="5" fill="#111111" />
      <rect x="90" y="60" width="8" height="8" rx="2" fill="#111111" />
      <circle cx="87" cy="92" r="3.5" fill="#7C3AED" />
      <circle cx="101" cy="92" r="3.5" fill="#7C3AED" />

      {/* back arm to suitcase */}
      <path d="M70 58 Q80 66 82 74" stroke="#111111" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* legs */}
      <rect x="49" y="80" width="8" height="24" rx="4" fill="#111111" />
      <rect x="63" y="80" width="8" height="24" rx="4" fill="#111111" />

      {/* body */}
      <rect x="42" y="42" width="36" height="42" rx="16" fill="#7C3AED" />

      {/* front arm */}
      <path d="M46 56 Q36 64 34 74" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* head */}
      <circle cx="60" cy="26" r="15" fill="#111111" />
      {/* explorer hat */}
      <path d="M42 22 Q60 6 78 22 Q60 16 42 22 Z" fill="#7C3AED" />
      <ellipse cx="60" cy="22" rx="20" ry="4" fill="#7C3AED" />
    </svg>
  );
}
