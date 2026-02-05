/**
 * Default chain configurations for supported EVM networks
 */

import type { ChainConfig } from "../types/index.js";

export const DEFAULT_CHAINS: Record<number, Partial<ChainConfig>> = {
  // Ethereum Mainnet
  1: {
    name: "Ethereum Mainnet",
    requiredConfirmations: 32,
  },
  // Base Mainnet
  8453: {
    name: "Base",
    requiredConfirmations: 12,
  },
  // Base Sepolia
  84532: {
    name: "Base Sepolia",
    requiredConfirmations: 6,
  },
};

/**
 * Get default chain name for a chain ID
 */
export function getDefaultChainName(chainId: number): string {
  return DEFAULT_CHAINS[chainId]?.name ?? `Chain ${chainId}`;
}

/**
 * Get default required confirmations for a chain ID
 */
export function getDefaultConfirmations(chainId: number): number {
  return DEFAULT_CHAINS[chainId]?.requiredConfirmations ?? 12;
}
