import type { Address, Hex } from "viem";
import type { EVMClient } from "./client.js";
import { parseTransferEvents, findFeeCollectorTransfers } from "./parser.js";
import { notFound, invalidInput } from "../../errors.js";
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
export async function validateTransaction(
  options: ValidateTransactionOptions,
): Promise<{ amount: bigint }> {
  const {
    client,
    txHash,
    from,
    feeCollectorAddress,
    aztTokenAddress,
    requiredConfirmations,
    minAmount,
    logger,
  } = options;

  // 1. Fetch receipt
  const receipt = await client.getTransactionReceipt(txHash);
  if (!receipt) {
    throw notFound("TX_NOT_FOUND", "Transaction receipt not found");
  }

  // 2. Verify success
  if (receipt.status !== "success") {
    throw invalidInput("TX_REVERTED", "Transaction reverted");
  }

  // 3. Check confirmations
  const currentBlock = await client.getBlockNumber();
  const confirmations = Number(currentBlock - receipt.blockNumber);
  if (confirmations < requiredConfirmations) {
    throw invalidInput(
      "TX_NOT_FINALIZED",
      `Transaction has ${confirmations} confirmations, required ${requiredConfirmations}`,
      { confirmations, required: requiredConfirmations },
    );
  }

  // 4. Parse transfers and filter
  const allTransfers = parseTransferEvents(receipt);
  const matchingTransfers = findFeeCollectorTransfers(
    allTransfers,
    feeCollectorAddress,
    aztTokenAddress,
    from,
  );

  if (matchingTransfers.length === 0) {
    throw invalidInput(
      "WRONG_RECIPIENT",
      "No AZT transfer to fee collector address found",
    );
  }

  // 5. Sum amounts and check minimum
  const totalAmount = matchingTransfers.reduce((sum, t) => sum + t.amount, 0n);
  if (totalAmount < minAmount) {
    throw invalidInput(
      "INVALID_AMOUNT",
      `Transfer amount ${totalAmount} is below minimum ${minAmount}`,
      {
        amount: totalAmount.toString(),
        minAmount: minAmount.toString(),
      },
    );
  }

  logger.info(
    { txHash, amount: totalAmount.toString(), from },
    "Transaction validated",
  );

  return { amount: totalAmount };
}
