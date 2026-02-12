import {
  createPublicClient,
  http,
  TransactionReceiptNotFoundError,
  type PublicClient,
  type Chain,
  type Hex,
  type TransactionReceipt,
} from "viem";
import type { ChainConfig } from "../../types/index.js";
import type { Logger } from "../../middleware/logger.js";

export interface EVMClient {
  chainId: number;
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

    async getTransactionReceipt(
      txHash: Hex,
    ): Promise<TransactionReceipt | null> {
      try {
        return await client.getTransactionReceipt({ hash: txHash });
      } catch (err) {
        if (err instanceof TransactionReceiptNotFoundError) {
          return null;
        }
        logger.warn(
          { err, chainId, txHash },
          "Failed to fetch transaction receipt",
        );
        throw err;
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
