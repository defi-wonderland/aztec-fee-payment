import { decodeEventLog, type Address, type TransactionReceipt } from "viem";

const TOPUP_EVENT_ABI = [
  {
    type: "event",
    name: "TopUp",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export interface ParsedTopUp {
  contract: Address;
  from: Address;
  amount: bigint;
}

/**
 * Parse all TopUp events from a transaction receipt.
 */
export function parseTopUpEvents(receipt: TransactionReceipt): ParsedTopUp[] {
  const events: ParsedTopUp[] = [];

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: TOPUP_EVENT_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === "TopUp") {
        events.push({
          contract: log.address as Address,
          from: decoded.args.from,
          amount: decoded.args.amount,
        });
      }
    } catch {
      // Not a TopUp event — skip
    }
  }

  return events;
}

/**
 * Find all TopUp events emitted by the expected contract from the given sender.
 * Filters by both `topUpContractAddress` and `from`.
 */
export function findMatchingTopUpEvents(
  events: ParsedTopUp[],
  topUpContractAddress: Address,
  from: Address,
): ParsedTopUp[] {
  const contractLower = topUpContractAddress.toLowerCase();
  const fromLower = from.toLowerCase();

  return events.filter(
    (e) =>
      e.from.toLowerCase() === fromLower &&
      e.contract.toLowerCase() === contractLower,
  );
}
