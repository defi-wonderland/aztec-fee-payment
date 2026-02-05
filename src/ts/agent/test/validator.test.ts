/**
 * Unit tests for EVM transaction validator
 */

import { describe, it, expect, vi } from "vitest";
import type { Address } from "viem";
import {
  validateTransaction,
  type ValidateTransactionOptions,
} from "../services/evm/validator.js";
import {
  DEFAULT_TX_HASH as TX_HASH,
  DEFAULT_FEE_COLLECTOR as FEE_COLLECTOR,
  DEFAULT_AZT_TOKEN as AZT_TOKEN,
  DEFAULT_SENDER as SENDER,
  createTransferLog,
  createMockReceipt,
  createMockTransaction,
  createMockEVMClient,
  createMockLogger,
} from "./helpers.js";

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
