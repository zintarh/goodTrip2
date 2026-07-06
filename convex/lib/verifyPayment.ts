// Verifies a claimed G$ ERC20 payment actually happened on-chain before a
// mutation grants whatever it costs (hint, streak freeze, ...). Convex can't
// read the frontend's NEXT_PUBLIC_* env vars, so this uses its own copies.
export async function verifyGDTransfer({
  txHash,
  from,
  minAmountDecimal,
}: {
  txHash: string;
  from: string;
  minAmountDecimal: string; // human units, e.g. "20" G$ — decimals are read on-chain, never assumed
}): Promise<void> {
  const rpcUrl       = process.env.CELO_RPC_URL;
  const tokenAddress = process.env.GD_TOKEN_ADDRESS;
  const treasury      = process.env.TREASURY_ADDRESS;

  if (!rpcUrl)       throw new Error("CELO_RPC_URL not set");
  if (!tokenAddress) throw new Error("GD_TOKEN_ADDRESS not set");
  if (!treasury)     throw new Error("TREASURY_ADDRESS not set");

  const { createPublicClient, http, decodeEventLog, parseAbiItem, parseUnits } = await import("viem");

  const client = createPublicClient({ transport: http(rpcUrl) });

  const decimalsAbi = [{ inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" }] as const;
  const decimals = await client.readContract({ address: tokenAddress as `0x${string}`, abi: decimalsAbi, functionName: "decimals" });
  const minAmount = parseUnits(minAmountDecimal, decimals);

  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (receipt.status !== "success") throw new Error("That payment transaction failed on-chain.");

  const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

  const matches = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics });
      const args = decoded.args as unknown as { from: string; to: string; value: bigint };
      return (
        args.from.toLowerCase() === from.toLowerCase() &&
        args.to.toLowerCase() === treasury.toLowerCase() &&
        args.value >= minAmount
      );
    } catch {
      return false;
    }
  });

  if (!matches) throw new Error("Couldn't verify a matching G$ payment for this transaction.");
}
