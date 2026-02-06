import type { ChainConfig } from "../types/index.js";

const CHAIN_ENV_PREFIX = "CHAIN_";

/**
 * Parse CHAIN_<id>_* environment variables into a Record<number, ChainConfig>.
 *
 * Expected format per chain:
 *   CHAIN_8453_RPC_URL=https://...
 *   CHAIN_8453_FEE_COLLECTOR=0x...
 *   CHAIN_8453_AZT_TOKEN=0x...
 *   CHAIN_8453_CONFIRMATIONS=12
 */
export function parseChainsFromEnv(
  env: Record<string, string | undefined>,
): Record<number, ChainConfig> {
  const chainIds = new Set<number>();

  for (const key of Object.keys(env)) {
    if (!key.startsWith(CHAIN_ENV_PREFIX)) continue;
    const match = key.match(/^CHAIN_(\d+)_/);
    if (match) chainIds.add(Number(match[1]));
  }

  const chains: Record<number, ChainConfig> = {};

  for (const chainId of chainIds) {
    const rpcUrl = env[`CHAIN_${chainId}_RPC_URL`];
    const feeCollector = env[`CHAIN_${chainId}_FEE_COLLECTOR`];
    const aztToken = env[`CHAIN_${chainId}_AZT_TOKEN`];
    const confirmations = env[`CHAIN_${chainId}_CONFIRMATIONS`];

    if (!rpcUrl || !feeCollector || !aztToken) continue;

    chains[chainId] = {
      name: env[`CHAIN_${chainId}_NAME`] ?? `chain-${chainId}`,
      rpcUrl,
      feeCollectorAddress: feeCollector as `0x${string}`,
      aztTokenAddress: aztToken as `0x${string}`,
      requiredConfirmations: confirmations ? Number(confirmations) : 1,
    };
  }

  return chains;
}
