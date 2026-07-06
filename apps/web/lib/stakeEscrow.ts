import type { WalletClient } from "viem";
import { parseUnits } from "viem";
import { publicClient, waitForSuccess, ensureChain } from "./viem-client";
import { STAKE_ESCROW_ABI, getContractAddresses } from "./contracts";
import { ERC20_ABI } from "./erc20";
import { getTokenAddress, type StakeToken } from "./tokens";

// Approves (if needed) and deposits a player's stake into an already-created
// StakeEscrow match. Shared by the creator (who must also stake their own
// entry right after createMatch) and by joiners on the invite page, so the
// two flows never drift apart.
export async function depositStake({
  address,
  walletClient,
  token,
  stakeAmount,
  matchId,
  onStatus,
}: {
  address: `0x${string}`;
  walletClient: WalletClient;
  token: StakeToken;
  stakeAmount: string;
  matchId: `0x${string}`;
  onStatus?: (status: "approving" | "depositing") => void;
}): Promise<`0x${string}`> {
  const contracts = getContractAddresses();
  if (!contracts.stakeEscrow) throw new Error("Staking isn't configured for this network yet.");

  const tokenAddress = getTokenAddress(token);
  const decimals = await publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" });
  const stakePerPlayer = parseUnits(stakeAmount, decimals);

  await ensureChain(walletClient);

  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address, contracts.stakeEscrow],
  });

  if (allowance < stakePerPlayer) {
    onStatus?.("approving");
    const { request } = await publicClient.simulateContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [contracts.stakeEscrow, stakePerPlayer],
      account: address,
    });
    await waitForSuccess(await walletClient.writeContract(request));
  }

  onStatus?.("depositing");
  const { request } = await publicClient.simulateContract({
    address: contracts.stakeEscrow,
    abi: STAKE_ESCROW_ABI,
    functionName: "deposit",
    args: [matchId],
    account: address,
  });
  const depositHash = await walletClient.writeContract(request);
  await waitForSuccess(depositHash);
  return depositHash;
}
