import { type Address, type TransactionReceipt } from "viem";
export interface ParsedTransfer {
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
}
/**
 * Parse all ERC20 Transfer events from a transaction receipt.
 */
export declare function parseTransferEvents(
  receipt: TransactionReceipt,
): ParsedTransfer[];
/**
 * Find all AZT token transfers to the fee collector address.
 * Filters by both `aztTokenAddress` and `feeCollectorAddress`.
 */
export declare function findFeeCollectorTransfers(
  transfers: ParsedTransfer[],
  feeCollectorAddress: Address,
  aztTokenAddress: Address,
): ParsedTransfer[];
//# sourceMappingURL=parser.d.ts.map
