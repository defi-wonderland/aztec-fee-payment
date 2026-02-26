import type { ChainConfig } from "../types/index.js";

const CHAIN_ENV_PREFIX = "CHAIN_";

/**
 * Parse CHAIN_<id>_* environment variables into a Record<number, ChainConfig>.
 *
 * Expected format per chain:
 *   CHAIN_8453_RPC_URL=https://...
 *   CHAIN_8453_TOPUP_CONTRACT=0x...
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
    const topUpContract = env[`CHAIN_${chainId}_TOPUP_CONTRACT`];
    const confirmations = env[`CHAIN_${chainId}_CONFIRMATIONS`];

    if (!rpcUrl || !topUpContract) {
      const missing = [
        !rpcUrl && "RPC_URL",
        !topUpContract && "TOPUP_CONTRACT",
      ].filter(Boolean);
      console.warn(`Chain ${chainId}: skipped — missing ${missing.join(", ")}`);
      continue;
    }

    chains[chainId] = {
      name: env[`CHAIN_${chainId}_NAME`] ?? `chain-${chainId}`,
      rpcUrl,
      topUpContractAddress: topUpContract as `0x${string}`,
      requiredConfirmations: confirmations ? Number(confirmations) : 1,
    };
  }

  return chains;
}
