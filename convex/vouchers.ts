import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/// Returns a signed EIP-712 ScoreAttestation voucher the frontend submits to ScoreRegistry.sol.
/// Only succeeds when the game is complete and belongs to the caller's address.
export const getScoreVoucher = action({
  args: {
    gameId: v.id("games"),
    playerAddress: v.string(),
  },
  handler: async (ctx, { gameId, playerAddress }): Promise<{ gameIdBytes32: `0x${string}`; totalScore: number; signature: string }> => {
    const game = await ctx.runQuery(internal.games.getGameForVoucher, { gameId });
    if (!game) throw new Error("Game not found");
    if (!game.isComplete) throw new Error("Game not complete yet");
    if (game.playerAddress.toLowerCase() !== playerAddress.toLowerCase()) {
      throw new Error("Not your game");
    }

    const signingKey      = process.env.CONVEX_BACKEND_SIGNING_KEY;
    const registryAddress = process.env.SCORE_REGISTRY_ADDRESS;
    const chainId         = parseInt(process.env.CELO_CHAIN_ID ?? "42220");

    if (!signingKey)      throw new Error("CONVEX_BACKEND_SIGNING_KEY not set");
    if (!registryAddress) throw new Error("SCORE_REGISTRY_ADDRESS not set");

    const { privateKeyToAccount } = await import("viem/accounts");
    const { keccak256, toBytes }  = await import("viem");

    const account = privateKeyToAccount(`0x${signingKey}` as `0x${string}`);

    // Deterministic bytes32 from the Convex string game ID
    const gameIdBytes32 = keccak256(toBytes(gameId)) as `0x${string}`;

    const signature = await account.signTypedData({
      domain: {
        name:              "GoodTrip",
        version:           "1",
        chainId,
        verifyingContract: registryAddress as `0x${string}`,
      },
      types: {
        ScoreAttestation: [
          { name: "player",     type: "address" },
          { name: "gameId",     type: "bytes32" },
          { name: "totalScore", type: "uint256" },
        ],
      },
      primaryType: "ScoreAttestation",
      message: {
        player:     playerAddress as `0x${string}`,
        gameId:     gameIdBytes32,
        totalScore: BigInt(game.totalScore),
      },
    });

    return { gameIdBytes32, totalScore: game.totalScore, signature };
  },
});

/// Signs a StakeEscrow.settle() attestation once every staked player in a
/// match has finished their game. Ranks the on-chain depositors by totalScore
/// (descending) and signs under StakeEscrow's own EIP-712 domain — a different
/// verifyingContract (and, deliberately, a different signing key — see
/// CONVEX_SETTLEMENT_SIGNING_KEY) than the ScoreRegistry voucher above, since
/// settlement authorizes real fund movement.
export const getMatchSettlementVoucher = action({
  args: {
    inviteMatchId: v.id("invite_matches"),
  },
  handler: async (ctx, { inviteMatchId }): Promise<{ matchId: `0x${string}`; rankedPlayers: string[]; signature: string }> => {
    const result = await ctx.runQuery(internal.inviteMatches.getMatchForSettlement, { inviteMatchId });
    if (!result) throw new Error("Game not found");
    const { match, players } = result;
    if (match.isSettled) throw new Error("This match is already settled");
    if (!match.stakeAmount) throw new Error("This match has no stake to settle");

    const signingKey    = process.env.CONVEX_SETTLEMENT_SIGNING_KEY;
    const escrowAddress = process.env.STAKE_ESCROW_ADDRESS;
    const rpcUrl        = process.env.CELO_RPC_URL;
    const chainId       = parseInt(process.env.CELO_CHAIN_ID ?? "42220");

    if (!signingKey)     throw new Error("CONVEX_SETTLEMENT_SIGNING_KEY not set");
    if (!escrowAddress)  throw new Error("STAKE_ESCROW_ADDRESS not set");
    if (!rpcUrl)         throw new Error("CELO_RPC_URL not set");

    const { privateKeyToAccount } = await import("viem/accounts");
    const { keccak256, toBytes, encodePacked, createPublicClient, http } = await import("viem");

    const account = privateKeyToAccount(`0x${signingKey}` as `0x${string}`);

    const matchId = (match.onChainMatchId as `0x${string}` | undefined) ?? keccak256(toBytes(inviteMatchId));

    // SECURITY: rank ONLY players who actually deposited into escrow on-chain.
    // `join()` (and thus match.playerAddresses) is unauthenticated, so ranking
    // every joiner would let someone who never staked be paid out of the pot
    // that real depositors funded. getPlayers() is the authoritative deposit
    // set. This also means a non-depositing joiner can't block settlement.
    const getPlayersAbi = [{
      inputs: [{ name: "matchId", type: "bytes32" }],
      name: "getPlayers",
      outputs: [{ name: "", type: "address[]" }],
      stateMutability: "view",
      type: "function",
    }] as const;
    const client = createPublicClient({ transport: http(rpcUrl) });
    const depositors = await client.readContract({
      address: escrowAddress as `0x${string}`,
      abi: getPlayersAbi,
      functionName: "getPlayers",
      args: [matchId],
    }) as readonly string[];
    const depositorSet = new Set(depositors.map((d) => d.toLowerCase()));

    const eligible = players.filter((p) => depositorSet.has(p.address.toLowerCase()));
    if (eligible.length === 0) throw new Error("No on-chain deposits found for this match yet.");
    if (!eligible.every((p) => p.isComplete)) throw new Error("Not all staked players have finished yet.");

    const rankedPlayers = [...eligible]
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((p) => p.address);

    // Must byte-for-byte match StakeEscrow.sol's keccak256(abi.encodePacked(rankedPlayers)).
    const rankedPlayersHash = keccak256(encodePacked(["address[]"], [rankedPlayers as `0x${string}`[]]));

    const signature = await account.signTypedData({
      domain: {
        name:              "GoodTrip",
        version:           "1",
        chainId,
        verifyingContract: escrowAddress as `0x${string}`,
      },
      types: {
        MatchSettlement: [
          { name: "matchId",           type: "bytes32" },
          { name: "rankedPlayersHash", type: "bytes32" },
        ],
      },
      primaryType: "MatchSettlement",
      message: {
        matchId,
        rankedPlayersHash,
      },
    });

    return { matchId, rankedPlayers, signature };
  },
});
