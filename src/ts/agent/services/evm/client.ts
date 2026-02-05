/**
 * Multi-chain EVM RPC client
 *
 * Uses viem for EVM interactions with retry logic and connection pooling.
 */

import {
  createPublicClient,
  http,
  type PublicClient,
  type Hex,
  type Transaction,
  type TransactionReceipt,
  type HttpTransport,
  type Chain,
} from "viem";
import * as chains from "viem/chains";
import type { ChainConfig } from "../../types/index.js";
import type { Logger } from "../../middleware/logger.js";

export interface EVMClient {
  chainId: number;
  getTransaction(txHash: Hex): Promise<Transaction | null>;
  getTransactionReceipt(txHash: Hex): Promise<TransactionReceipt | null>;
  getBlockNumber(): Promise<bigint>;
  isFinalized(txHash: Hex, requiredConfirmations: number): Promise<boolean>;
}

/**
 * Create a viem PublicClient for a specific chain
 */
function createClient(
  chainId: number,
  rpcUrl: string,
): PublicClient<HttpTransport, Chain> {
  // Try to find the chain in viem's known chains
  const viemChain = Object.values(chains).find(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      "id" in c &&
      (c as Chain).id === chainId,
  ) as Chain | undefined;

  // If not found, create a custom chain
  const chain: Chain = viemChain ?? {
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  };

  return createPublicClient({
    chain,
    transport: http(rpcUrl, {
      retryCount: 3,
      retryDelay: 1000,
      timeout: 30000,
    }),
  });
}

/**
 * Create an EVMClient wrapper around a viem PublicClient
 */
function createEVMClientWrapper(
  client: PublicClient<HttpTransport, Chain>,
  chainId: number,
  logger: Logger,
): EVMClient {
  return {
    chainId,

    async getTransaction(txHash: Hex): Promise<Transaction | null> {
      try {
        const tx = await client.getTransaction({ hash: txHash });
        return tx;
      } catch (error) {
        logger.debug({ txHash, error }, "Failed to fetch transaction");
        return null;
      }
    },

    async getTransactionReceipt(
      txHash: Hex,
    ): Promise<TransactionReceipt | null> {
      try {
        const receipt = await client.getTransactionReceipt({ hash: txHash });
        return receipt;
      } catch (error) {
        logger.debug({ txHash, error }, "Failed to fetch transaction receipt");
        return null;
      }
    },

    async getBlockNumber(): Promise<bigint> {
      return client.getBlockNumber();
    },

    async isFinalized(
      txHash: Hex,
      requiredConfirmations: number,
    ): Promise<boolean> {
      const receipt = await this.getTransactionReceipt(txHash);
      if (!receipt || !receipt.blockNumber) return false;

      const currentBlock = await this.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1n;
      return confirmations >= BigInt(requiredConfirmations);
    },
  };
}

/**
 * Multi-chain EVM client manager
 */
export class MultiChainEVMClient {
  private clients: Map<number, EVMClient> = new Map();
  private logger: Logger;

  constructor(chainConfigs: Record<number, ChainConfig>, logger: Logger) {
    this.logger = logger;

    for (const [chainIdStr, config] of Object.entries(chainConfigs)) {
      const chainId = parseInt(chainIdStr, 10);
      const publicClient = createClient(chainId, config.rpcUrl);
      const evmClient = createEVMClientWrapper(publicClient, chainId, logger);
      this.clients.set(chainId, evmClient);
      logger.info({ chainId, name: config.name }, "EVM client initialized");
    }
  }

  /**
   * Get client for a specific chain
   */
  getClientForChain(chainId: number): EVMClient | undefined {
    return this.clients.get(chainId);
  }

  /**
   * Check if a chain is supported
   */
  isChainSupported(chainId: number): boolean {
    return this.clients.has(chainId);
  }

  /**
   * Get list of supported chain IDs
   */
  getSupportedChains(): number[] {
    return Array.from(this.clients.keys());
  }
}
