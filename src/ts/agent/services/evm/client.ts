import {
  createPublicClient,
  http,
  type PublicClient,
  type Chain,
  type Hex,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import type { ChainConfig } from "../../types/index.js";
import type { Logger } from "../../middleware/logger.js";

export interface EVMClient {
  chainId: number;
  getTransaction(txHash: Hex): Promise<Transaction | null>;
  getTransactionReceipt(txHash: Hex): Promise<TransactionReceipt | null>;
  getBlockNumber(): Promise<bigint>;
}

function buildViemChain(chainId: number, name: string, rpcUrl: string): Chain {
  return {
    id: chainId,
    name,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  };
}

function createEVMClient(
  chainId: number,
  config: ChainConfig,
  logger: Logger,
): EVMClient {
  const chain = buildViemChain(chainId, config.name, config.rpcUrl);

  const client: PublicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl, {
      retryCount: 3,
      retryDelay: 1000,
      timeout: 30_000,
    }),
  });

  return {
    chainId,

    async getTransaction(txHash: Hex): Promise<Transaction | null> {
      try {
        return await client.getTransaction({ hash: txHash });
      } catch (err) {
        logger.warn({ err, chainId, txHash }, "Failed to fetch transaction");
        return null;
      }
    },

    async getTransactionReceipt(
      txHash: Hex,
    ): Promise<TransactionReceipt | null> {
      try {
        return await client.getTransactionReceipt({ hash: txHash });
      } catch (err) {
        logger.warn(
          { err, chainId, txHash },
          "Failed to fetch transaction receipt",
        );
        return null;
      }
    },

    async getBlockNumber(): Promise<bigint> {
      return client.getBlockNumber();
    },
  };
}

export class MultiChainEVMClient {
  private clients: Map<number, EVMClient>;

  constructor(chainConfigs: Record<number, ChainConfig>, logger: Logger) {
    this.clients = new Map();
    for (const [id, config] of Object.entries(chainConfigs)) {
      const chainId = Number(id);
      this.clients.set(chainId, createEVMClient(chainId, config, logger));
      logger.info({ chainId, name: config.name }, "EVM client initialized");
    }
  }

  getClientForChain(chainId: number): EVMClient | undefined {
    return this.clients.get(chainId);
  }

  isChainSupported(chainId: number): boolean {
    return this.clients.has(chainId);
  }

  getSupportedChains(): number[] {
    return [...this.clients.keys()];
  }
}
