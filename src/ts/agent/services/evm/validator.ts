/**
 * Transaction validator
 *
 * Validates EVM transactions to ensure they are:
 * - Successful (status = 1)
 * - Finalized (enough confirmations)
 * - Sent to the correct recipient (fee collector)
 */

import type { Address, Hex } from "viem";
import type { EVMClient } from "./client.js";
import { parseTransferEvents, findFeeCollectorTransfers } from "./parser.js";
import type {
  TransactionValidationResult,
  TransactionInfo,
} from "../../types/index.js";
import type { Logger } from "../../middleware/logger.js";

export interface ValidateTransactionOptions {
  client: EVMClient;
  txHash: Hex;
  feeCollectorAddress: Address;
  aztTokenAddress: Address;
  requiredConfirmations: number;
  logger: Logger;
}

/**
 * Validate a transaction for fee payment
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
    logger,
  } = options;

  // 1. Fetch transaction
  const tx = await client.getTransaction(txHash);
  if (!tx) {
    logger.debug({ txHash }, "Transaction not found");
    return {
      valid: false,
      error: "TX_NOT_FOUND",
      errorMessage: `Transaction ${txHash} not found`,
    };
  }

  // 2. Fetch receipt
  const receipt = await client.getTransactionReceipt(txHash);
  if (!receipt) {
    logger.debug({ txHash }, "Transaction receipt not found");
    return {
      valid: false,
      error: "TX_NOT_FOUND",
      errorMessage: `Transaction receipt for ${txHash} not found`,
    };
  }

  // 3. Verify transaction succeeded
  if (receipt.status !== "success") {
    logger.debug({ txHash, status: receipt.status }, "Transaction failed");
    return {
      valid: false,
      error: "TX_NOT_FOUND",
      errorMessage: `Transaction ${txHash} failed`,
    };
  }

  // 4. Verify transaction is finalized
  const currentBlock = await client.getBlockNumber();
  const confirmations = currentBlock - receipt.blockNumber + 1n;

  if (confirmations < BigInt(requiredConfirmations)) {
    logger.debug(
      { txHash, confirmations, required: requiredConfirmations },
      "Transaction not finalized",
    );
    return {
      valid: false,
      error: "TX_NOT_FINALIZED",
      errorMessage: `Transaction has ${confirmations} confirmations, required ${requiredConfirmations}`,
    };
  }

  // 5. Parse transfers and find all AZT payments to fee collector
  const transfers = findFeeCollectorTransfers(
    parseTransferEvents(receipt),
    feeCollectorAddress,
    aztTokenAddress,
  );

  if (transfers.length === 0) {
    logger.debug(
      { txHash, feeCollectorAddress },
      "No transfer to fee collector found",
    );
    return {
      valid: false,
      error: "WRONG_RECIPIENT",
      errorMessage: `No transfer to fee collector ${feeCollectorAddress} found in transaction`,
    };
  }

  // 6. Sum all transfer amounts
  const totalAmount = transfers.reduce((sum, t) => sum + t.amount, 0n);

  if (totalAmount <= 0n) {
    logger.debug({ txHash, amount: totalAmount }, "Invalid transfer amount");
    return {
      valid: false,
      error: "INVALID_AMOUNT",
      errorMessage: "Transfer amount must be positive",
    };
  }

  // Success!
  const txInfo: TransactionInfo = {
    hash: txHash,
    from: tx.from,
    to: feeCollectorAddress,
    amount: totalAmount,
    blockNumber: receipt.blockNumber,
    confirmations,
  };

  logger.debug(
    { txHash, from: tx.from, amount: totalAmount.toString() },
    "Transaction validated successfully",
  );

  return {
    valid: true,
    transaction: txInfo,
  };
}
