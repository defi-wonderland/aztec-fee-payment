import type { ChainConfig } from "../types/index.js";
/**
 * Parse CHAIN_<id>_* environment variables into a Record<number, ChainConfig>.
 *
 * Expected format per chain:
 *   CHAIN_8453_RPC_URL=https://...
 *   CHAIN_8453_FEE_COLLECTOR=0x...
 *   CHAIN_8453_AZT_TOKEN=0x...
 *   CHAIN_8453_CONFIRMATIONS=12
 */
export declare function parseChainsFromEnv(env: Record<string, string | undefined>): Record<number, ChainConfig>;
//# sourceMappingURL=schema.d.ts.map