/**
 * ERC20 Transfer event parser
 *
 * Parses Transfer events from transaction receipts to extract
 * token transfer information.
 */

import type { TransactionReceipt, Address, Hex, Log } from "viem";
import { decodeEventLog } from "viem";
import type { ParsedTransfer } from "../../types/index.js";

// ERC20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_SIGNATURE =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

// ERC20 Transfer event ABI
const TRANSFER_ABI = [
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

/**
 * Check if a log is a Transfer event
 */
function isTransferEvent(log: Log): boolean {
  return log.topics.length >= 3 && log.topics[0] === TRANSFER_EVENT_SIGNATURE;
}

/**
 * Parse a single Transfer event log
 */
function parseTransferLog(log: Log): ParsedTransfer | null {
  if (!isTransferEvent(log)) return null;

  try {
    const decoded = decodeEventLog({
      abi: TRANSFER_ABI,
      data: log.data,
      topics: log.topics,
    });

    if (decoded.eventName !== "Transfer") return null;

    return {
      token: log.address as Address,
      from: decoded.args.from as Address,
      to: decoded.args.to as Address,
      amount: decoded.args.value as bigint,
    };
  } catch {
    return null;
  }
}

/**
 * Parse all Transfer events from a transaction receipt
 */
export function parseTransferEvents(
  receipt: TransactionReceipt,
): ParsedTransfer[] {
  const transfers: ParsedTransfer[] = [];

  for (const log of receipt.logs) {
    const transfer = parseTransferLog(log);
    if (transfer) {
      transfers.push(transfer);
    }
  }

  return transfers;
}

/**
 * Find all AZT token transfers to the fee collector address
 *
 * Returns all transfers where the token is AZT and the recipient
 * is the fee collector, allowing the caller to sum amounts if needed.
 */
export function findFeeCollectorTransfers(
  transfers: ParsedTransfer[],
  feeCollectorAddress: Address,
  aztTokenAddress: Address,
): ParsedTransfer[] {
  const feeCollectorLower = feeCollectorAddress.toLowerCase();
  const aztTokenLower = aztTokenAddress.toLowerCase();

  return transfers.filter(
    (t) =>
      t.to.toLowerCase() === feeCollectorLower &&
      t.token.toLowerCase() === aztTokenLower,
  );
}
