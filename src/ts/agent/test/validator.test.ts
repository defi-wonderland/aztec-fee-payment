import { describe, it, expect, vi } from "vitest";
import type { Address } from "viem";
import { validateTransaction } from "../services/evm/validator.js";
import {
  FEE_COLLECTOR,
  AZT_TOKEN,
  USER,
  TX_HASH,
  makeTransferLog,
  createMockClient,
  validatorOpts,
} from "./helpers.js";

function receiptWith(logs: ReturnType<typeof makeTransferLog>[]) {
  return { status: "success", blockNumber: 100n, logs };
}

describe("Transaction Validator", () => {
  it("validates a legitimate transaction", async () => {
    const result = await validateTransaction(validatorOpts(createMockClient()));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.amount).toBe(1000000000000000000n);
      expect(result.from.toLowerCase()).toBe(USER.toLowerCase());
    }
  });

  it("returns TX_NOT_FOUND when transaction is missing", async () => {
    const client = createMockClient({
      getTransaction: vi.fn().mockResolvedValue(null),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("TX_NOT_FOUND");
  });

  it("returns TX_NOT_FOUND when receipt is missing", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("TX_NOT_FOUND");
  });

  it("returns TX_NOT_FOUND when transaction failed", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue({ status: "reverted", blockNumber: 100n, logs: [] }),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("TX_NOT_FOUND");
  });

  it("returns TX_NOT_FINALIZED when not enough confirmations", async () => {
    const client = createMockClient({
      getBlockNumber: vi.fn().mockResolvedValue(103n),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("TX_NOT_FINALIZED");
      expect(result.details?.confirmations).toBe(3);
      expect(result.details?.required).toBe(6);
    }
  });

  it("passes when confirmations exactly equal required", async () => {
    // blockNumber=100, currentBlock=106 => 6 confirmations = 6 required
    const client = createMockClient({
      getBlockNumber: vi.fn().mockResolvedValue(106n),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(true);
  });

  it("fails when confirmations are one less than required", async () => {
    // blockNumber=100, currentBlock=105 => 5 confirmations < 6 required
    const client = createMockClient({
      getBlockNumber: vi.fn().mockResolvedValue(105n),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("TX_NOT_FINALIZED");
  });

  it("does not call getBlockNumber if receipt is null", async () => {
    const getBlockNumber = vi.fn();
    const client = createMockClient({
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
      getBlockNumber,
    });
    await validateTransaction(validatorOpts(client));
    expect(getBlockNumber).not.toHaveBeenCalled();
  });

  it("does not call getTransactionReceipt if transaction is null", async () => {
    const getTransactionReceipt = vi.fn();
    const client = createMockClient({
      getTransaction: vi.fn().mockResolvedValue(null),
      getTransactionReceipt,
    });
    await validateTransaction(validatorOpts(client));
    expect(getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("returns WRONG_RECIPIENT when no matching transfers", async () => {
    const wrongToken = "0x9999999999999999999999999999999999999999" as Address;
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(
          receiptWith([
            makeTransferLog(wrongToken, USER, FEE_COLLECTOR, 1000n),
          ]),
        ),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("WRONG_RECIPIENT");
  });

  it("sums multiple matching transfers", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(
          receiptWith([
            makeTransferLog(AZT_TOKEN, USER, FEE_COLLECTOR, 500n),
            makeTransferLog(AZT_TOKEN, USER, FEE_COLLECTOR, 300n),
          ]),
        ),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.amount).toBe(800n);
  });

  it("returns INVALID_AMOUNT when transfer amount is zero", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(
          receiptWith([makeTransferLog(AZT_TOKEN, USER, FEE_COLLECTOR, 0n)]),
        ),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("INVALID_AMOUNT");
  });

  it("returns INVALID_AMOUNT when amount is below configured minimum", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(
          receiptWith([makeTransferLog(AZT_TOKEN, USER, FEE_COLLECTOR, 500n)]),
        ),
    });
    const result = await validateTransaction(
      validatorOpts(client, { minAmount: 1000n }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("INVALID_AMOUNT");
      expect(result.details?.amount).toBe("500");
      expect(result.details?.minAmount).toBe("1000");
    }
  });

  it("passes when amount exactly equals minimum", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(
          receiptWith([makeTransferLog(AZT_TOKEN, USER, FEE_COLLECTOR, 1000n)]),
        ),
    });
    const result = await validateTransaction(
      validatorOpts(client, { minAmount: 1000n }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.amount).toBe(1000n);
  });
});
