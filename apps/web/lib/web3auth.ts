import type { Web3AuthContextConfig } from "@web3auth/modal/react";
import { WEB3AUTH_NETWORK } from "@web3auth/modal";

// GoodTrip runs on Celo mainnet only. We configure ONLY this chain (no
// Ethereum/Sepolia/testnet) and pin it as defaultChainId, so the embedded
// wallet can never silently land the user on a different network — which is
// what caused the earlier ChainMismatchError when submitting scores.
const CELO_CHAIN = {
  chainNamespace: "eip155" as const,
  chainId: "0xa4ec", // 42220 — Celo Mainnet
  rpcTarget: process.env.NEXT_PUBLIC_CELO_RPC ?? "https://forno.celo.org",
  displayName: "Celo Mainnet",
  blockExplorerUrl: "https://celoscan.io",
  ticker: "CELO",
  tickerName: "Celo",
  logo: "https://cryptologos.cc/logos/celo-celo-logo.png",
};

// Web3Auth's key-infrastructure network is INDEPENDENT of the blockchain: a
// Sapphire Devnet clientId authenticates users fine while the app transacts on
// Celo mainnet. It must match the network the clientId was created for, though
// — using SAPPHIRE_MAINNET with a devnet clientId makes init fail ("Couldn't
// reach Web3Auth"). Default to devnet (the existing clientId); flip to mainnet
// only after minting a Sapphire Mainnet clientId in the Web3Auth dashboard.
const web3AuthNetwork =
  process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK === "mainnet"
    ? WEB3AUTH_NETWORK.SAPPHIRE_MAINNET
    : WEB3AUTH_NETWORK.SAPPHIRE_DEVNET;

export const web3AuthConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "",
    web3AuthNetwork,
    chains: [CELO_CHAIN],
    defaultChainId: CELO_CHAIN.chainId,
  },
};
