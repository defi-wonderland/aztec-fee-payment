import { type Hex, type TransactionReceipt } from "viem";
import type { ChainConfig } from "../../types/index.js";
import type { Logger } from "../../middleware/logger.js";
export interface EVMClient {
  chainId: number;
  getTransactionReceipt(txHash: Hex): Promise<TransactionReceipt | null>;
  getBlockNumber(): Promise<bigint>;
}
export declare class MultiChainEVMClient {
  private clients;
  constructor(chainConfigs: Record<number, ChainConfig>, logger: Logger);
  getClientForChain(chainId: number): EVMClient | undefined;
  isChainSupported(chainId: number): boolean;
  getSupportedChains(): number[];
}
//# sourceMappingURL=client.d.ts.map
