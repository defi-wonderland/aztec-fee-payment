import { describe, it, expect } from "vitest";
import type { Address, TransactionReceipt, Log } from "viem";
import {
  parseTransferEvents,
  findFeeCollectorTransfers,
} from "../services/evm/parser.js";
import { FEE_COLLECTOR, USER, makeTransferLog } from "./helpers.js";

const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

function makeReceipt(logs: Log<bigint, number, false>[]): TransactionReceipt {
  return {
    blockHash: "0x" as `0x${string}`,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 0n,
    effectiveGasPrice: 0n,
    from: USER,
    gasUsed: 0n,
    logs,
    logsBloom: "0x" as `0x${string}`,
    status: "success",
    to: null,
    transactionHash: "0x" as `0x${string}`,
    transactionIndex: 0,
    type: "eip1559",
  };
}

describe("EVM Parser", () => {
  describe("parseTransferEvents", () => {
    it("parses a single Transfer event", () => {
      const receipt = makeReceipt([
        makeTransferLog(TOKEN_A, USER, FEE_COLLECTOR, 1000n),
      ]);
      const transfers = parseTransferEvents(receipt);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].token.toLowerCase()).toBe(TOKEN_A.toLowerCase());
      expect(transfers[0].from.toLowerCase()).toBe(USER.toLowerCase());
      expect(transfers[0].to.toLowerCase()).toBe(FEE_COLLECTOR.toLowerCase());
      expect(transfers[0].amount).toBe(1000n);
    });

    it("parses multiple Transfer events", () => {
      const receipt = makeReceipt([
        makeTransferLog(TOKEN_A, USER, FEE_COLLECTOR, 500n),
        makeTransferLog(TOKEN_B, USER, FEE_COLLECTOR, 300n),
      ]);
      expect(parseTransferEvents(receipt)).toHaveLength(2);
    });

    it("ignores non-Transfer events", () => {
      const badLog: Log<bigint, number, false> = {
        address: TOKEN_A,
        topics: [
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        ],
        data: "0x",
        blockNumber: 1n,
        transactionHash: "0x" as `0x${string}`,
        transactionIndex: 0,
        blockHash: "0x" as `0x${string}`,
        logIndex: 0,
        removed: false,
      };
      expect(parseTransferEvents(makeReceipt([badLog]))).toHaveLength(0);
    });

    it("returns empty array for receipt with no logs", () => {
      expect(parseTransferEvents(makeReceipt([]))).toHaveLength(0);
    });
  });

  describe("findFeeCollectorTransfers", () => {
    it("filters by both token address AND fee collector", () => {
      const transfers = [
        { token: TOKEN_A, from: USER, to: FEE_COLLECTOR, amount: 100n },
        { token: TOKEN_B, from: USER, to: FEE_COLLECTOR, amount: 200n },
        { token: TOKEN_A, from: USER, to: USER, amount: 300n },
      ];
      const matching = findFeeCollectorTransfers(
        transfers,
        FEE_COLLECTOR,
        TOKEN_A,
        USER,
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].amount).toBe(100n);
    });

    it("returns multiple matching transfers", () => {
      const transfers = [
        { token: TOKEN_A, from: USER, to: FEE_COLLECTOR, amount: 100n },
        { token: TOKEN_A, from: USER, to: FEE_COLLECTOR, amount: 200n },
      ];
      expect(
        findFeeCollectorTransfers(transfers, FEE_COLLECTOR, TOKEN_A, USER),
      ).toHaveLength(2);
    });

    it("returns empty when no matches", () => {
      const transfers = [
        { token: TOKEN_B, from: USER, to: FEE_COLLECTOR, amount: 100n },
      ];
      expect(
        findFeeCollectorTransfers(transfers, FEE_COLLECTOR, TOKEN_A, USER),
      ).toHaveLength(0);
    });

    it("handles case-insensitive address comparison", () => {
      const transfers = [
        {
          token: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address,
          from: USER,
          to: "0x1111111111111111111111111111111111111111" as Address,
          amount: 100n,
        },
      ];
      expect(
        findFeeCollectorTransfers(transfers, FEE_COLLECTOR, TOKEN_A, USER),
      ).toHaveLength(1);
    });
  });
});
