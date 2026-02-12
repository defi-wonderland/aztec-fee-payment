import type { Address, Hex } from "viem";
import type { EVMClient } from "./client.js";
import type { Logger } from "../../middleware/logger.js";
export interface ValidateTransactionOptions {
  client: EVMClient;
  txHash: Hex;
  from: Address;
  feeCollectorAddress: Address;
  aztTokenAddress: Address;
  requiredConfirmations: number;
  minAmount: bigint;
  logger: Logger;
}
/**
 * Validate an EVM transaction for FPC claim eligibility.
 *
 * Throws an AppError on validation failure:
 * 1. Fetch receipt (TX_NOT_FOUND if missing or failed)
 * 2. Check confirmations (TX_NOT_FINALIZED)
 * 3. Parse Transfer events, filter by AZT token AND fee collector (WRONG_RECIPIENT)
 * 4. Sum matching amounts, reject if below minAmount (INVALID_AMOUNT)
 */
export declare function validateTransaction(
  options: ValidateTransactionOptions,
): Promise<{
  amount: bigint;
}>;
//# sourceMappingURL=validator.d.ts.map
