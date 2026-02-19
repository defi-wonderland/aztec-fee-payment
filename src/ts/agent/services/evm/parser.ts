import { decodeEventLog, type Address, type TransactionReceipt } from "viem";

const ERC20_TRANSFER_EVENT_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export interface ParsedTransfer {
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
}

/**
 * Parse all ERC20 Transfer events from a transaction receipt.
 */
export function parseTransferEvents(
  receipt: TransactionReceipt,
): ParsedTransfer[] {
  const transfers: ParsedTransfer[] = [];

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ERC20_TRANSFER_EVENT_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === "Transfer") {
        transfers.push({
          token: log.address as Address,
          from: decoded.args.from,
          to: decoded.args.to,
          amount: decoded.args.value,
        });
      }
    } catch {
      // Not a Transfer event — skip
    }
  }

  return transfers;
}

/**
 * Find all AZT token transfers to the fee collector address.
 * Filters by both `aztTokenAddress` and `feeCollectorAddress`.
 */
export function findFeeCollectorTransfers(
  transfers: ParsedTransfer[],
  feeCollectorAddress: Address,
  aztTokenAddress: Address,
  from: Address,
): ParsedTransfer[] {
  const feeCollectorLower = feeCollectorAddress.toLowerCase();
  const aztTokenLower = aztTokenAddress.toLowerCase();
  const fromLower = from.toLowerCase();

  return transfers.filter(
    (t) =>
      t.from.toLowerCase() === fromLower &&
      t.to.toLowerCase() === feeCollectorLower &&
      t.token.toLowerCase() === aztTokenLower,
  );
}
