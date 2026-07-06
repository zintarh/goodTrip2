// Maps technical/blockchain error text to plain-language messages users can
// actually act on. Never show raw contract revert data or SDK error dumps.
const KNOWN_ERRORS: { match: string; message: string }[] = [
  { match: "usernametaken", message: "That username is already taken — try another one." },
  { match: "alreadyregistered", message: "Looks like you're already registered — refresh the page." },
  { match: "invalidusername", message: "Only letters, numbers, and underscores are allowed." },
  { match: "user rejected", message: "Transaction cancelled." },
  { match: "chainmismatch", message: "Your wallet is on the wrong network — switch it to Celo and try again." },
  { match: "does not match the target chain", message: "Your wallet is on the wrong network — switch it to Celo and try again." },
  { match: "insufficient funds", message: "Not enough CELO in your wallet to cover the network fee." },
  { match: "not_whitelisted", message: "You'll need to verify your identity first." },
  { match: "voucheralreadyused", message: "This score was already recorded on-chain." },
  { match: "gamealreadyrecorded", message: "This game's score was already recorded on-chain." },
  { match: "invalidsignature", message: "Couldn't verify this score with the server — please try again." },
];

export function toFriendlyError(e: unknown, fallback = "Something went wrong — please try again."): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const known = KNOWN_ERRORS.find((k) => msg.includes(k.match));
  return known?.message ?? fallback;
}
