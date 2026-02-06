import type { Address, Hex } from "viem";
import type { EVMClient } from "./client.js";
import { parseTransferEvents, findFeeCollectorTransfers } from "./parser.js";
import type { ErrorCode } from "../../types/index.js";
import type { Logger } from "../../middleware/logger.js";

export interface ValidateTransactionOptions {
  client: EVMClient;
  txHash: Hex;
  feeCollectorAddress: Address;
  aztTokenAddress: Address;
  requiredConfirmations: number;
  minAmount: bigint;
  logger: Logger;
}

export type TransactionValidationResult =
  | { valid: true; amount: bigint; from: Address }
  | {
      valid: false;
      error: ErrorCode;
      message: string;
      details?: Record<string, unknown>;
    };

/**
 * Validate an EVM transaction for FPC claim eligibility.
 *
 * Steps:
 * 1. Fetch transaction (TX_NOT_FOUND if missing)
 * 2. Fetch receipt (TX_NOT_FOUND if missing)
 * 3. Verify status is 'success' (TX_NOT_FOUND if failed)
 * 4. Check confirmations (TX_NOT_FINALIZED)
 * 5. Parse Transfer events, filter by AZT token AND fee collector (WRONG_RECIPIENT)
 * 6. Sum matching amounts, reject if below minAmount (INVALID_AMOUNT)
 */
export async function validateTransaction(
  options: ValidateTransactionOptions,
): Promise<TransactionValidationResult> {
  const {
    client,
    txHash,
    feeCollectorAddress,
    aztTokenAddress,
    requiredConfirmations,
    minAmount,
    logger,
  } = options;

  // 1. Fetch transaction
  const tx = await client.getTransaction(txHash);
  if (!tx) {
    return {
      valid: false,
      error: "TX_NOT_FOUND",
      message: "Transaction not found on chain",
    };
  }

  // 2. Fetch receipt
  const receipt = await client.getTransactionReceipt(txHash);
  if (!receipt) {
    return {
      valid: false,
      error: "TX_NOT_FOUND",
      message: "Transaction receipt not found",
    };
  }

  // 3. Verify success
  if (receipt.status !== "success") {
    return {
      valid: false,
      error: "TX_NOT_FOUND",
      message: "Transaction failed",
    };
  }

  // 4. Check confirmations
  const currentBlock = await client.getBlockNumber();
  const confirmations = Number(currentBlock - receipt.blockNumber);
  if (confirmations < requiredConfirmations) {
    return {
      valid: false,
      error: "TX_NOT_FINALIZED",
      message: `Transaction has ${confirmations} confirmations, required ${requiredConfirmations}`,
      details: { confirmations, required: requiredConfirmations },
    };
  }

  // 5. Parse transfers and filter
  const allTransfers = parseTransferEvents(receipt);
  const matchingTransfers = findFeeCollectorTransfers(
    allTransfers,
    feeCollectorAddress,
    aztTokenAddress,
  );

  if (matchingTransfers.length === 0) {
    return {
      valid: false,
      error: "WRONG_RECIPIENT",
      message: "No AZT transfer to fee collector address found",
    };
  }

  // 6. Sum amounts and check minimum
  const totalAmount = matchingTransfers.reduce((sum, t) => sum + t.amount, 0n);
  if (totalAmount < minAmount) {
    return {
      valid: false,
      error: "INVALID_AMOUNT",
      message: `Transfer amount ${totalAmount} is below minimum ${minAmount}`,
      details: {
        amount: totalAmount.toString(),
        minAmount: minAmount.toString(),
      },
    };
  }

  logger.info(
    { txHash, amount: totalAmount.toString(), from: tx.from },
    "Transaction validated",
  );

  return { valid: true, amount: totalAmount, from: tx.from as Address };
}
