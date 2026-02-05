/**
 * Shared test utilities for EVM-related test files
 */

import type { Address, Hex, Log, Transaction, TransactionReceipt } from "viem";
import { vi } from "vitest";
import type { EVMClient } from "../services/evm/client.js";
import type { Logger } from "../middleware/logger.js";

// ============================================================================
// Shared Test Constants
// ============================================================================

/** ERC20 Transfer(address,address,uint256) event signature */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;

export const DEFAULT_TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
export const DEFAULT_FEE_COLLECTOR =
  "0x1234567890123456789012345678901234567890" as Address;
export const DEFAULT_AZT_TOKEN =
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
export const DEFAULT_SENDER =
  "0x1111111111111111111111111111111111111111" as Address;
export const DEFAULT_BLOCK_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Create a mock ERC20 Transfer event log
 */
export function createTransferLog(
  token: Address,
  from: Address,
  to: Address,
  amount: bigint,
  overrides?: { blockNumber?: bigint; transactionHash?: Hex },
): Log {
  const fromTopic = `0x000000000000000000000000${from.slice(2)}` as Hex;
  const toTopic = `0x000000000000000000000000${to.slice(2)}` as Hex;
  const amountHex = amount.toString(16).padStart(64, "0");

  return {
    address: token,
    topics: [TRANSFER_TOPIC, fromTopic, toTopic],
    data: `0x${amountHex}` as Hex,
    blockNumber: overrides?.blockNumber ?? 100n,
    blockHash: DEFAULT_BLOCK_HASH,
    transactionHash: overrides?.transactionHash ?? DEFAULT_TX_HASH,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
}

/**
 * Create a mock TransactionReceipt
 */
export function createMockReceipt(
  logs: Log[],
  overrides?: Partial<TransactionReceipt>,
): TransactionReceipt {
  return {
    blockHash: DEFAULT_BLOCK_HASH,
    blockNumber: 100n,
    contractAddress: null,
    cumulativeGasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
    from: DEFAULT_SENDER,
    gasUsed: 21000n,
    logs,
    logsBloom: "0x" as Hex,
    status: "success",
    to: DEFAULT_FEE_COLLECTOR,
    transactionHash: DEFAULT_TX_HASH,
    transactionIndex: 0,
    type: "eip1559",
    blobGasPrice: 0n,
    blobGasUsed: 0n,
    root: undefined,
    ...overrides,
  } as TransactionReceipt;
}

/**
 * Create a mock Transaction object
 */
export function createMockTransaction(
  overrides?: Partial<Transaction>,
): Transaction {
  return {
    hash: DEFAULT_TX_HASH,
    from: DEFAULT_SENDER,
    to: DEFAULT_FEE_COLLECTOR,
    value: 0n,
    nonce: 0,
    gas: 21000n,
    gasPrice: 1000000000n,
    input: "0x",
    blockHash: DEFAULT_BLOCK_HASH,
    blockNumber: 100n,
    transactionIndex: 0,
    type: "eip1559",
    typeHex: "0x02",
    chainId: 1,
    v: 0n,
    r: "0x0" as Hex,
    s: "0x0" as Hex,
    ...overrides,
  } as Transaction;
}

/**
 * Create a mock EVMClient with vi.fn() stubs
 */
export function createMockEVMClient(overrides?: Partial<EVMClient>): EVMClient {
  return {
    chainId: 1,
    getTransaction: vi.fn().mockResolvedValue(createMockTransaction()),
    getTransactionReceipt: vi
      .fn()
      .mockResolvedValue(
        createMockReceipt([
          createTransferLog(
            DEFAULT_AZT_TOKEN,
            DEFAULT_SENDER,
            DEFAULT_FEE_COLLECTOR,
            1000000n,
          ),
        ]),
      ),
    getBlockNumber: vi.fn().mockResolvedValue(110n),
    ...overrides,
  };
}

/**
 * Create a mock Logger with vi.fn() stubs
 */
export function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as unknown as Logger;
}
