import { describe, it, expect } from "vitest";
import type { Address, TransactionReceipt, Log } from "viem";
import {
  parseTopUpEvents,
  findMatchingTopUpEvents,
} from "../services/evm/parser.js";
import { USER, makeTopUpLog } from "./helpers.js";

const CONTRACT_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const CONTRACT_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

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
  describe("parseTopUpEvents", () => {
    it("parses a single TopUp event", () => {
      const receipt = makeReceipt([makeTopUpLog(CONTRACT_A, USER, 1000n)]);
      const events = parseTopUpEvents(receipt);

      expect(events).toHaveLength(1);
      expect(events[0].contract.toLowerCase()).toBe(CONTRACT_A.toLowerCase());
      expect(events[0].from.toLowerCase()).toBe(USER.toLowerCase());
      expect(events[0].amount).toBe(1000n);
    });

    it("parses multiple TopUp events", () => {
      const receipt = makeReceipt([
        makeTopUpLog(CONTRACT_A, USER, 500n),
        makeTopUpLog(CONTRACT_B, USER, 300n),
      ]);
      expect(parseTopUpEvents(receipt)).toHaveLength(2);
    });

    it("ignores non-TopUp events", () => {
      const badLog: Log<bigint, number, false> = {
        address: CONTRACT_A,
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
      expect(parseTopUpEvents(makeReceipt([badLog]))).toHaveLength(0);
    });

    it("returns empty array for receipt with no logs", () => {
      expect(parseTopUpEvents(makeReceipt([]))).toHaveLength(0);
    });
  });

  describe("findMatchingTopUpEvents", () => {
    it("filters by contract address AND sender", () => {
      const events = [
        { contract: CONTRACT_A, from: USER, amount: 100n },
        { contract: CONTRACT_B, from: USER, amount: 200n },
      ];
      const matching = findMatchingTopUpEvents(events, CONTRACT_A, USER);
      expect(matching).toHaveLength(1);
      expect(matching[0].amount).toBe(100n);
    });

    it("returns multiple matching events", () => {
      const events = [
        { contract: CONTRACT_A, from: USER, amount: 100n },
        { contract: CONTRACT_A, from: USER, amount: 200n },
      ];
      expect(findMatchingTopUpEvents(events, CONTRACT_A, USER)).toHaveLength(2);
    });

    it("returns empty when no matches", () => {
      const events = [{ contract: CONTRACT_B, from: USER, amount: 100n }];
      expect(findMatchingTopUpEvents(events, CONTRACT_A, USER)).toHaveLength(0);
    });

    it("handles case-insensitive address comparison", () => {
      const events = [
        {
          contract: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address,
          from: USER,
          amount: 100n,
        },
      ];
      expect(findMatchingTopUpEvents(events, CONTRACT_A, USER)).toHaveLength(1);
    });
  });
});
