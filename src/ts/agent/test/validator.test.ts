import { describe, it, expect, vi } from "vitest";
import type { Address } from "viem";
import { validateTransaction } from "../services/evm/validator.js";
import { AppError } from "../errors.js";
import {
  FEE_COLLECTOR,
  AZT_TOKEN,
  USER,
  makeTransferLog,
  createMockClient,
  validatorOpts,
} from "./helpers.js";

function receiptWith(
  logs: ReturnType<typeof makeTransferLog>[],
  from: Address = USER,
) {
  return { status: "success", blockNumber: 100n, from, logs };
}

describe("Transaction Validator", () => {
  it("validates a legitimate transaction", async () => {
    const result = await validateTransaction(validatorOpts(createMockClient()));
    expect(result.amount).toBe(1000000000000000000n);
  });

  it("throws TX_NOT_FOUND when receipt is missing", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
    });
    await expect(validateTransaction(validatorOpts(client))).rejects.toThrow(
      AppError,
    );
    await expect(
      validateTransaction(validatorOpts(client)),
    ).rejects.toMatchObject({ code: "TX_NOT_FOUND" });
  });

  it("throws TX_REVERTED when transaction failed", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue({ status: "reverted", blockNumber: 100n, logs: [] }),
    });
    await expect(validateTransaction(validatorOpts(client))).rejects.toThrow(
      AppError,
    );
    await expect(
      validateTransaction(validatorOpts(client)),
    ).rejects.toMatchObject({ code: "TX_REVERTED" });
  });

  it("throws TX_NOT_FINALIZED when not enough confirmations", async () => {
    const client = createMockClient({
      getBlockNumber: vi.fn().mockResolvedValue(103n),
    });
    await expect(validateTransaction(validatorOpts(client))).rejects.toThrow(
      AppError,
    );
    try {
      await validateTransaction(validatorOpts(client));
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe("TX_NOT_FINALIZED");
      expect(appErr.details?.confirmations).toBe(3);
      expect(appErr.details?.required).toBe(6);
    }
  });

  it("passes when confirmations exactly equal required", async () => {
    // blockNumber=100, currentBlock=106 => 6 confirmations = 6 required
    const client = createMockClient({
      getBlockNumber: vi.fn().mockResolvedValue(106n),
    });
    const result = await validateTransaction(validatorOpts(client));
    expect(result.amount).toBeDefined();
  });

  it("fails when confirmations are one less than required", async () => {
    // blockNumber=100, currentBlock=105 => 5 confirmations < 6 required
    const client = createMockClient({
      getBlockNumber: vi.fn().mockResolvedValue(105n),
    });
    await expect(
      validateTransaction(validatorOpts(client)),
    ).rejects.toMatchObject({ code: "TX_NOT_FINALIZED" });
  });

  it("does not call getBlockNumber if receipt is null", async () => {
    const getBlockNumber = vi.fn();
    const client = createMockClient({
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
      getBlockNumber,
    });
    await expect(validateTransaction(validatorOpts(client))).rejects.toThrow();
    expect(getBlockNumber).not.toHaveBeenCalled();
  });

  it("throws WRONG_RECIPIENT when no matching transfers", async () => {
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
    await expect(
      validateTransaction(validatorOpts(client)),
    ).rejects.toMatchObject({ code: "WRONG_RECIPIENT" });
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
    expect(result.amount).toBe(800n);
  });

  it("throws INVALID_AMOUNT when transfer amount is zero", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(
          receiptWith([makeTransferLog(AZT_TOKEN, USER, FEE_COLLECTOR, 0n)]),
        ),
    });
    await expect(
      validateTransaction(validatorOpts(client)),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("throws INVALID_AMOUNT when amount is below configured minimum", async () => {
    const client = createMockClient({
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(
          receiptWith([makeTransferLog(AZT_TOKEN, USER, FEE_COLLECTOR, 500n)]),
        ),
    });
    try {
      await validateTransaction(validatorOpts(client, { minAmount: 1000n }));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe("INVALID_AMOUNT");
      expect(appErr.details?.amount).toBe("500");
      expect(appErr.details?.minAmount).toBe("1000");
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
    expect(result.amount).toBe(1000n);
  });
});
