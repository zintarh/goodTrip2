export type StakeToken = "GD" | "USDT";

// No G$/USDT address is guessed or hardcoded here — both must be supplied via
// env per network. GoodDollar in particular has no testnet deployment, so
// NEXT_PUBLIC_GD_TOKEN_ADDRESS is expected to be unset on Celo Sepolia.
export function getTokenAddress(token: StakeToken): `0x${string}` {
  const address =
    token === "GD"
      ? process.env.NEXT_PUBLIC_GD_TOKEN_ADDRESS
      : process.env.NEXT_PUBLIC_USDT_TOKEN_ADDRESS;

  if (!address) {
    throw new Error(`${token === "GD" ? "G$" : "USDT"} isn't configured for this network yet.`);
  }
  return address as `0x${string}`;
}
