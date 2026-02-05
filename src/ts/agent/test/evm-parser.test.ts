/**
 * Unit tests for EVM transfer parser
 */

import { describe, it, expect } from "vitest";
import type { TransactionReceipt, Address, Log } from "viem";
import {
  parseTransferEvents,
  findFeeCollectorTransfers,
} from "../services/evm/parser.js";

describe("EVM Transfer Parser", () => {
  const feeCollector = "0x1234567890123456789012345678901234567890" as Address;
  const tokenAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
  const sender = "0x1111111111111111111111111111111111111111" as Address;

  describe("parseTransferEvents", () => {
    it("parses valid ERC20 Transfer events", () => {
      const receipt = createMockReceipt([
        createTransferLog(tokenAddress, sender, feeCollector, 1000000n),
      ]);

      const transfers = parseTransferEvents(receipt);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].token.toLowerCase()).toBe(tokenAddress.toLowerCase());
      expect(transfers[0].from.toLowerCase()).toBe(sender.toLowerCase());
      expect(transfers[0].to.toLowerCase()).toBe(feeCollector.toLowerCase());
      expect(transfers[0].amount).toBe(1000000n);
    });

    it("handles multiple transfers", () => {
      const otherRecipient =
        "0x2222222222222222222222222222222222222222" as Address;
      const receipt = createMockReceipt([
        createTransferLog(tokenAddress, sender, otherRecipient, 500000n),
        createTransferLog(tokenAddress, otherRecipient, feeCollector, 500000n),
      ]);

      const transfers = parseTransferEvents(receipt);

      expect(transfers).toHaveLength(2);
    });

    it("ignores non-Transfer events", () => {
      const receipt = createMockReceipt([
        {
          address: tokenAddress,
          topics: [
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          ],
          data: "0x",
          blockNumber: 1n,
          blockHash: "0x" as `0x${string}`,
          transactionHash: "0x" as `0x${string}`,
          transactionIndex: 0,
          logIndex: 0,
          removed: false,
        },
      ]);

      const transfers = parseTransferEvents(receipt);

      expect(transfers).toHaveLength(0);
    });

    it("returns empty array for receipt with no logs", () => {
      const receipt = createMockReceipt([]);
      const transfers = parseTransferEvents(receipt);
      expect(transfers).toHaveLength(0);
    });
  });

  describe("findFeeCollectorTransfers", () => {
    it("finds AZT transfer to fee collector", () => {
      const transfers = [
        {
          token: tokenAddress,
          from: sender,
          to: feeCollector,
          amount: 1000000n,
        },
      ];

      const found = findFeeCollectorTransfers(
        transfers,
        feeCollector,
        tokenAddress,
      );

      expect(found).toHaveLength(1);
      expect(found[0].to.toLowerCase()).toBe(feeCollector.toLowerCase());
    });

    it("returns all AZT transfers to fee collector", () => {
      const transfers = [
        {
          token: tokenAddress,
          from: sender,
          to: feeCollector,
          amount: 500000n,
        },
        {
          token: tokenAddress,
          from: sender,
          to: feeCollector,
          amount: 1000000n,
        },
      ];

      const found = findFeeCollectorTransfers(
        transfers,
        feeCollector,
        tokenAddress,
      );

      expect(found).toHaveLength(2);
      const totalAmount = found.reduce((sum, t) => sum + t.amount, 0n);
      expect(totalAmount).toBe(1500000n);
    });

    it("returns empty array when no transfer to fee collector", () => {
      const otherAddress =
        "0x9999999999999999999999999999999999999999" as Address;
      const transfers = [
        {
          token: tokenAddress,
          from: sender,
          to: otherAddress,
          amount: 1000000n,
        },
      ];

      const found = findFeeCollectorTransfers(
        transfers,
        feeCollector,
        tokenAddress,
      );

      expect(found).toHaveLength(0);
    });

    it("returns empty array when transfer uses wrong token", () => {
      const wrongToken =
        "0x9999999999999999999999999999999999999999" as Address;
      const transfers = [
        { token: wrongToken, from: sender, to: feeCollector, amount: 1000000n },
      ];

      const found = findFeeCollectorTransfers(
        transfers,
        feeCollector,
        tokenAddress,
      );

      expect(found).toHaveLength(0);
    });

    it("handles case-insensitive address comparison", () => {
      const transfers = [
        {
          token: tokenAddress.toUpperCase() as Address,
          from: sender,
          to: feeCollector.toUpperCase() as Address,
          amount: 1000000n,
        },
      ];

      const found = findFeeCollectorTransfers(
        transfers,
        feeCollector.toLowerCase() as Address,
        tokenAddress.toLowerCase() as Address,
      );

      expect(found).toHaveLength(1);
    });
  });
});

// Helper functions

function createMockReceipt(logs: Log[]): TransactionReceipt {
  return {
    blockHash:
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
    from: "0x0000000000000000000000000000000000000001" as `0x${string}`,
    gasUsed: 21000n,
    logs,
    logsBloom: "0x" as `0x${string}`,
    status: "success",
    to: "0x0000000000000000000000000000000000000002" as `0x${string}`,
    transactionHash:
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    transactionIndex: 0,
    type: "eip1559",
    blobGasPrice: 0n,
    blobGasUsed: 0n,
    root: undefined,
  };
}

function createTransferLog(
  tokenAddress: Address,
  from: Address,
  to: Address,
  amount: bigint,
): Log {
  // Pad addresses to 32 bytes for topics
  const fromTopic =
    `0x000000000000000000000000${from.slice(2)}` as `0x${string}`;
  const toTopic = `0x000000000000000000000000${to.slice(2)}` as `0x${string}`;

  // Encode amount as 32-byte hex
  const amountHex = amount.toString(16).padStart(64, "0");

  return {
    address: tokenAddress,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      fromTopic,
      toTopic,
    ],
    data: `0x${amountHex}` as `0x${string}`,
    blockNumber: 1n,
    blockHash:
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    transactionHash:
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
}
