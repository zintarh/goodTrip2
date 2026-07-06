import { keccak256, toBytes } from "viem";

// Derives a deterministic bytes32 on-chain id from a Convex string id.
// Mirrors the same approach convex/vouchers.ts uses for gameId -> gameIdBytes32,
// so creator and joiners always compute the identical StakeEscrow matchId.
export function deriveMatchId(inviteMatchId: string): `0x${string}` {
  return keccak256(toBytes(inviteMatchId));
}
