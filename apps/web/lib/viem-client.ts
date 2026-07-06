import { createPublicClient, createWalletClient, custom, http } from "viem";
import type { WalletClient } from "viem";
import { celo } from "viem/chains";

// GoodTrip runs on Celo mainnet only. (Testnet/Sepolia support was removed.)
export const chain = celo;

export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_CELO_RPC ?? "https://forno.celo.org"),
});

export function makeWalletClient(provider: unknown) {
  return createWalletClient({
    chain,
    transport: custom(provider as Parameters<typeof custom>[0]),
  });
}

export async function getBalance(address: `0x${string}`) {
  return publicClient.getBalance({ address });
}

// Waits for a submitted tx to actually land, and throws if it reverted —
// a bare tx hash from writeContract only means "broadcast", not "succeeded".
export async function waitForSuccess(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted on-chain.");
  return receipt;
}

// Wallets (including external ones surfaced through Web3Auth) can sit on a
// different network than Celo mainnet, which makes viem refuse to send with a
// ChainMismatchError. Switch the wallet to Celo first, adding it if the wallet
// doesn't know it.
export async function ensureChain(walletClient: WalletClient) {
  const current = await walletClient.getChainId();
  if (current === chain.id) return;

  try {
    await walletClient.switchChain({ id: chain.id });
  } catch (err) {
    // 4902 (and some wallets' text equivalents) = chain not added yet.
    const code = (err as { code?: number })?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === 4902 || /unrecognized chain|not (been )?added/i.test(message)) {
      await walletClient.addChain({ chain });
      await walletClient.switchChain({ id: chain.id });
    } else {
      throw err;
    }
  }
}
