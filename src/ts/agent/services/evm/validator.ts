import type { Address, Hex } from "viem";
import type { EVMClient } from "./client.js";
import { parseTopUpEvents, findMatchingTopUpEvents } from "./parser.js";
import { notFound, invalidInput } from "../../errors.js";
import type { Logger } from "../../middleware/logger.js";

export interface ValidateTransactionOptions {
  client: EVMClient;
  txHash: Hex;
  from: Address;
  topUpContractAddress: Address;
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
 * 3. Parse TopUp events, filter by TopUp contract AND sender (WRONG_RECIPIENT)
 * 4. Sum matching amounts, reject if below minAmount (INVALID_AMOUNT)
 */
export async function validateTransaction(
  options: ValidateTransactionOptions,
): Promise<{ amount: bigint }> {
  const {
    client,
    txHash,
    from,
    topUpContractAddress,
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

  // 4. Parse TopUp events and filter
  const allEvents = parseTopUpEvents(receipt);
  const matchingEvents = findMatchingTopUpEvents(
    allEvents,
    topUpContractAddress,
    from,
  );

  if (matchingEvents.length === 0) {
    throw invalidInput(
      "WRONG_RECIPIENT",
      "No TopUp event from sender found in transaction",
    );
  }

  // 5. Sum amounts and check minimum
  const totalAmount = matchingEvents.reduce((sum, e) => sum + e.amount, 0n);
  if (totalAmount < minAmount) {
    throw invalidInput(
      "INVALID_AMOUNT",
      `TopUp amount ${totalAmount} is below minimum ${minAmount}`,
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
