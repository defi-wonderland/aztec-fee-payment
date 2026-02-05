/**
 * Configuration loader for the FPC Off-Chain Agent
 *
 * Loads configuration from environment variables with Zod validation.
 *
 * Environment Variables:
 * - SP_SIGNING_KEY: 32-byte hex private key for secret generation
 * - FPC_ADDRESS: Aztec FPC contract address
 * - OWNER_ADDRESS: Aztec owner account address
 * - PORT: Server port (default: 3000)
 * - HOST: Server host (default: 0.0.0.0)
 * - LOG_LEVEL: Log level (debug, info, warn, error)
 * - RATE_LIMIT_WINDOW_MS: Rate limit window in ms (default: 60000)
 * - RATE_LIMIT_MAX_REQUESTS: Max requests per window (default: 100)
 * - CHAIN_{ID}_RPC_URL: RPC URL for chain ID
 * - CHAIN_{ID}_FEE_COLLECTOR: Fee collector address for chain ID
 * - CHAIN_{ID}_AZT_TOKEN: AZT token address for chain ID
 * - CHAIN_{ID}_CONFIRMATIONS: Required confirmations for chain ID
 */

import "dotenv/config";
import type { AgentConfig, ChainConfig } from "../types/index.js";
import { agentConfigSchema } from "./schema.js";
import { getDefaultChainName, getDefaultConfirmations } from "./chains.js";
import type { Address, Hex } from "viem";

/**
 * Parse chain configurations from environment variables.
 * Looks for CHAIN_{ID}_RPC_URL, CHAIN_{ID}_FEE_COLLECTOR, CHAIN_{ID}_AZT_TOKEN, CHAIN_{ID}_CONFIRMATIONS
 */
function parseChainConfigs(): Record<number, ChainConfig> {
  const chains: Record<number, ChainConfig> = {};
  const chainIdPattern = /^CHAIN_(\d+)_RPC_URL$/;

  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(chainIdPattern);
    if (match && value) {
      const chainId = parseInt(match[1], 10);
      const feeCollector = process.env[`CHAIN_${chainId}_FEE_COLLECTOR`];
      const aztToken = process.env[`CHAIN_${chainId}_AZT_TOKEN`];
      const confirmations = process.env[`CHAIN_${chainId}_CONFIRMATIONS`];

      if (feeCollector && aztToken) {
        chains[chainId] = {
          name: getDefaultChainName(chainId),
          rpcUrl: value,
          feeCollectorAddress: feeCollector as Address,
          aztTokenAddress: aztToken as Address,
          requiredConfirmations: confirmations
            ? parseInt(confirmations, 10)
            : getDefaultConfirmations(chainId),
        };
      }
    }
  }

  return chains;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): AgentConfig {
  const rawConfig = {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    host: process.env.HOST ?? "0.0.0.0",
    logLevel: process.env.LOG_LEVEL ?? "info",
    chains: parseChainConfigs(),
    spSigningKey: process.env.SP_SIGNING_KEY as Hex,
    rateLimit: {
      windowMs: process.env.RATE_LIMIT_WINDOW_MS
        ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
        : 60000,
      maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS
        ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
        : 100,
    },
    aztec: {
      fpcAddress: process.env.FPC_ADDRESS,
      ownerAddress: process.env.OWNER_ADDRESS,
    },
  };

  const result = agentConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data as AgentConfig;
}

export { agentConfigSchema, authwitRequestSchema } from "./schema.js";
