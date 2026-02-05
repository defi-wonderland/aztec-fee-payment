/**
 * Unit tests for EVM transaction validator
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Address, Hex, Transaction, TransactionReceipt } from "viem";
import {
  validateTransaction,
  type ValidateTransactionOptions,
} from "../services/evm/validator.js";
import type { EVMClient } from "../services/evm/client.js";
import type { Logger } from "../middleware/logger.js";

// ============================================================================
// Test Constants
// ============================================================================

const TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const FEE_COLLECTOR = "0x1234567890123456789012345678901234567890" as Address;
const AZT_TOKEN = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const SENDER = "0x1111111111111111111111111111111111111111" as Address;

// ERC20 Transfer event signature
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ============================================================================
// Helpers
// ============================================================================

function createMockLogger(): Logger {
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

function createMockTransaction(overrides?: Partial<Transaction>): Transaction {
  return {
    hash: TX_HASH,
    from: SENDER,
    to: FEE_COLLECTOR,
    value: 0n,
    nonce: 0,
    gas: 21000n,
    gasPrice: 1000000000n,
    input: "0x",
    blockHash:
      "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
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

function createTransferLog(
  token: Address,
  from: Address,
  to: Address,
  amount: bigint,
) {
  const fromTopic = `0x000000000000000000000000${from.slice(2)}` as Hex;
  const toTopic = `0x000000000000000000000000${to.slice(2)}` as Hex;
  const amountHex = amount.toString(16).padStart(64, "0");

  return {
    address: token,
    topics: [TRANSFER_TOPIC, fromTopic, toTopic] as [Hex, Hex, Hex],
    data: `0x${amountHex}` as Hex,
    blockNumber: 100n,
    blockHash:
      "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
}

function createMockReceipt(
  logs: ReturnType<typeof createTransferLog>[],
  overrides?: Partial<TransactionReceipt>,
): TransactionReceipt {
  return {
    blockHash:
      "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
    blockNumber: 100n,
    contractAddress: null,
    cumulativeGasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
    from: SENDER,
    gasUsed: 21000n,
    logs,
    logsBloom: "0x" as Hex,
    status: "success",
    to: FEE_COLLECTOR,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    type: "eip1559",
    blobGasPrice: 0n,
    blobGasUsed: 0n,
    root: undefined,
    ...overrides,
  } as TransactionReceipt;
}

function createMockEVMClient(overrides?: Partial<EVMClient>): EVMClient {
  return {
    chainId: 1,
    getTransaction: vi.fn().mockResolvedValue(createMockTransaction()),
    getTransactionReceipt: vi
      .fn()
      .mockResolvedValue(
        createMockReceipt([
          createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 1000000n),
        ]),
      ),
    getBlockNumber: vi.fn().mockResolvedValue(110n),
    isFinalized: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createOptions(
  overrides?: Partial<ValidateTransactionOptions>,
): ValidateTransactionOptions {
  return {
    client: createMockEVMClient(),
    txHash: TX_HASH,
    feeCollectorAddress: FEE_COLLECTOR,
    aztTokenAddress: AZT_TOKEN,
    requiredConfirmations: 5,
    logger: createMockLogger(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("validateTransaction", () => {
  describe("successful validation", () => {
    it("validates a valid transaction", async () => {
      const options = createOptions();
      const result = await validateTransaction(options);

      expect(result.valid).toBe(true);
      expect(result.transaction).toBeDefined();
      expect(result.transaction!.hash).toBe(TX_HASH);
      expect(result.transaction!.from).toBe(SENDER);
      expect(result.transaction!.to).toBe(FEE_COLLECTOR);
      expect(result.transaction!.amount).toBe(1000000n);
      expect(result.transaction!.blockNumber).toBe(100n);
      expect(result.transaction!.confirmations).toBe(11n); // 110 - 100 + 1
    });

    it("sums amounts from multiple transfers to fee collector", async () => {
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt([
              createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 500000n),
              createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 300000n),
              createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 200000n),
            ]),
          ),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(true);
      expect(result.transaction!.amount).toBe(1000000n);
    });

    it("ignores transfers to other addresses when summing", async () => {
      const otherAddress =
        "0x9999999999999999999999999999999999999999" as Address;
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt([
              createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 500000n),
              createTransferLog(AZT_TOKEN, SENDER, otherAddress, 9999999n),
            ]),
          ),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(true);
      expect(result.transaction!.amount).toBe(500000n);
    });

    it("ignores transfers of wrong token", async () => {
      const wrongToken =
        "0x9999999999999999999999999999999999999999" as Address;
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt([
              createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 500000n),
              createTransferLog(wrongToken, SENDER, FEE_COLLECTOR, 9999999n),
            ]),
          ),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(true);
      expect(result.transaction!.amount).toBe(500000n);
    });
  });

  describe("transaction not found", () => {
    it("returns TX_NOT_FOUND when transaction does not exist", async () => {
      const client = createMockEVMClient({
        getTransaction: vi.fn().mockResolvedValue(null),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("TX_NOT_FOUND");
      expect(result.errorMessage).toContain(TX_HASH);
    });

    it("returns TX_NOT_FOUND when receipt does not exist", async () => {
      const client = createMockEVMClient({
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("TX_NOT_FOUND");
      expect(result.errorMessage).toContain("receipt");
    });
  });

  describe("transaction failed", () => {
    it("returns TX_NOT_FOUND when transaction status is reverted", async () => {
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt(
              [createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 1000000n)],
              { status: "reverted" },
            ),
          ),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("TX_NOT_FOUND");
      expect(result.errorMessage).toContain("failed");
    });
  });

  describe("transaction not finalized", () => {
    it("returns TX_NOT_FINALIZED when not enough confirmations", async () => {
      // Block 100 receipt, current block 102 => 3 confirmations, need 5
      const client = createMockEVMClient({
        getBlockNumber: vi.fn().mockResolvedValue(102n),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("TX_NOT_FINALIZED");
      expect(result.errorMessage).toContain("3"); // actual confirmations
      expect(result.errorMessage).toContain("5"); // required
    });

    it("passes when confirmations exactly equal required", async () => {
      // Block 100 receipt, current block 104 => 5 confirmations, need 5
      const client = createMockEVMClient({
        getBlockNumber: vi.fn().mockResolvedValue(104n),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(true);
    });

    it("fails when confirmations are one less than required", async () => {
      // Block 100 receipt, current block 103 => 4 confirmations, need 5
      const client = createMockEVMClient({
        getBlockNumber: vi.fn().mockResolvedValue(103n),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("TX_NOT_FINALIZED");
    });

    it("passes with single required confirmation (same block)", async () => {
      const client = createMockEVMClient({
        getBlockNumber: vi.fn().mockResolvedValue(100n), // same block as receipt
      });

      const result = await validateTransaction(
        createOptions({ client, requiredConfirmations: 1 }),
      );

      expect(result.valid).toBe(true);
      expect(result.transaction!.confirmations).toBe(1n);
    });
  });

  describe("wrong recipient / no transfer", () => {
    it("returns WRONG_RECIPIENT when no transfer to fee collector", async () => {
      const otherAddress =
        "0x9999999999999999999999999999999999999999" as Address;
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt([
              createTransferLog(AZT_TOKEN, SENDER, otherAddress, 1000000n),
            ]),
          ),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("WRONG_RECIPIENT");
      expect(result.errorMessage).toContain(FEE_COLLECTOR);
    });

    it("returns WRONG_RECIPIENT when receipt has no logs", async () => {
      const client = createMockEVMClient({
        getTransactionReceipt: vi.fn().mockResolvedValue(createMockReceipt([])),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("WRONG_RECIPIENT");
    });

    it("returns WRONG_RECIPIENT when only wrong-token transfers to fee collector", async () => {
      const wrongToken =
        "0x9999999999999999999999999999999999999999" as Address;
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt([
              createTransferLog(wrongToken, SENDER, FEE_COLLECTOR, 1000000n),
            ]),
          ),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("WRONG_RECIPIENT");
    });
  });

  describe("invalid amount", () => {
    it("returns INVALID_AMOUNT when transfer amount is zero", async () => {
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt([
              createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 0n),
            ]),
          ),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_AMOUNT");
      expect(result.errorMessage).toContain("positive");
    });
  });

  describe("edge cases", () => {
    it("handles very large transfer amounts", async () => {
      const largeAmount = 2n ** 128n - 1n;
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt([
              createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, largeAmount),
            ]),
          ),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(true);
      expect(result.transaction!.amount).toBe(largeAmount);
    });

    it("handles very large block numbers", async () => {
      const largeBlockNumber = 99999999n;
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue(
            createMockReceipt(
              [createTransferLog(AZT_TOKEN, SENDER, FEE_COLLECTOR, 1000000n)],
              { blockNumber: largeBlockNumber },
            ),
          ),
        getBlockNumber: vi.fn().mockResolvedValue(largeBlockNumber + 10n),
      });

      const result = await validateTransaction(createOptions({ client }));

      expect(result.valid).toBe(true);
      expect(result.transaction!.confirmations).toBe(11n);
    });

    it("calls client methods in correct order", async () => {
      const client = createMockEVMClient();
      const options = createOptions({ client });

      await validateTransaction(options);

      // getTransaction should be called first
      expect(client.getTransaction).toHaveBeenCalledWith(TX_HASH);
      // Then getTransactionReceipt
      expect(client.getTransactionReceipt).toHaveBeenCalledWith(TX_HASH);
      // Then getBlockNumber for confirmation check
      expect(client.getBlockNumber).toHaveBeenCalled();
    });

    it("does not call getBlockNumber if receipt is null", async () => {
      const client = createMockEVMClient({
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
      });

      await validateTransaction(createOptions({ client }));

      expect(client.getBlockNumber).not.toHaveBeenCalled();
    });

    it("does not call getTransactionReceipt if transaction is null", async () => {
      const client = createMockEVMClient({
        getTransaction: vi.fn().mockResolvedValue(null),
      });

      await validateTransaction(createOptions({ client }));

      expect(client.getTransactionReceipt).not.toHaveBeenCalled();
    });
  });

  describe("error propagation", () => {
    it("propagates error when getTransaction throws", async () => {
      const client = createMockEVMClient({
        getTransaction: vi.fn().mockRejectedValue(new Error("Network error")),
      });

      await expect(
        validateTransaction(createOptions({ client })),
      ).rejects.toThrow("Network error");
    });

    it("propagates error when getTransactionReceipt throws", async () => {
      const client = createMockEVMClient({
        getTransactionReceipt: vi
          .fn()
          .mockRejectedValue(new Error("RPC timeout")),
      });

      await expect(
        validateTransaction(createOptions({ client })),
      ).rejects.toThrow("RPC timeout");
    });

    it("propagates error when getBlockNumber throws", async () => {
      const client = createMockEVMClient({
        getBlockNumber: vi
          .fn()
          .mockRejectedValue(new Error("Block fetch failed")),
      });

      await expect(
        validateTransaction(createOptions({ client })),
      ).rejects.toThrow("Block fetch failed");
    });
  });
});
