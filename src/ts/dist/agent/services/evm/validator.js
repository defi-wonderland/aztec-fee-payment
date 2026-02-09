import { parseTransferEvents, findFeeCollectorTransfers } from "./parser.js";
import { notFound, invalidInput } from "../../errors.js";
/**
 * Validate an EVM transaction for FPC claim eligibility.
 *
 * Throws an AppError on validation failure:
 * 1. Fetch receipt (TX_NOT_FOUND if missing or failed)
 * 2. Check confirmations (TX_NOT_FINALIZED)
 * 3. Parse Transfer events, filter by AZT token AND fee collector (WRONG_RECIPIENT)
 * 4. Sum matching amounts, reject if below minAmount (INVALID_AMOUNT)
 */
export async function validateTransaction(options) {
  const {
    client,
    txHash,
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
    throw notFound("TX_NOT_FOUND", "Transaction failed");
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
    { txHash, amount: totalAmount.toString(), from: receipt.from },
    "Transaction validated",
  );
  return { amount: totalAmount, from: receipt.from };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vYWdlbnQvc2VydmljZXMvZXZtL3ZhbGlkYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDN0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQWtCekQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLG1CQUFtQixDQUN2QyxPQUFtQztJQUVuQyxNQUFNLEVBQ0osTUFBTSxFQUNOLE1BQU0sRUFDTixtQkFBbUIsRUFDbkIsZUFBZSxFQUNmLHFCQUFxQixFQUNyQixTQUFTLEVBQ1QsTUFBTSxHQUNQLEdBQUcsT0FBTyxDQUFDO0lBRVosbUJBQW1CO0lBQ25CLE1BQU0sT0FBTyxHQUFHLE1BQU0sTUFBTSxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNiLE1BQU0sUUFBUSxDQUFDLGNBQWMsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFRCxvQkFBb0I7SUFDcEIsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sUUFBUSxDQUFDLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCx5QkFBeUI7SUFDekIsTUFBTSxZQUFZLEdBQUcsTUFBTSxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7SUFDbkQsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLFlBQVksR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDakUsSUFBSSxhQUFhLEdBQUcscUJBQXFCLEVBQUUsQ0FBQztRQUMxQyxNQUFNLFlBQVksQ0FDaEIsa0JBQWtCLEVBQ2xCLG1CQUFtQixhQUFhLDRCQUE0QixxQkFBcUIsRUFBRSxFQUNuRixFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUscUJBQXFCLEVBQUUsQ0FDbkQsQ0FBQztJQUNKLENBQUM7SUFFRCxnQ0FBZ0M7SUFDaEMsTUFBTSxZQUFZLEdBQUcsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbEQsTUFBTSxpQkFBaUIsR0FBRyx5QkFBeUIsQ0FDakQsWUFBWSxFQUNaLG1CQUFtQixFQUNuQixlQUFlLENBQ2hCLENBQUM7SUFFRixJQUFJLGlCQUFpQixDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNuQyxNQUFNLFlBQVksQ0FDaEIsaUJBQWlCLEVBQ2pCLGdEQUFnRCxDQUNqRCxDQUFDO0lBQ0osQ0FBQztJQUVELG1DQUFtQztJQUNuQyxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM3RSxJQUFJLFdBQVcsR0FBRyxTQUFTLEVBQUUsQ0FBQztRQUM1QixNQUFNLFlBQVksQ0FDaEIsZ0JBQWdCLEVBQ2hCLG1CQUFtQixXQUFXLHFCQUFxQixTQUFTLEVBQUUsRUFDOUQ7WUFDRSxNQUFNLEVBQUUsV0FBVyxDQUFDLFFBQVEsRUFBRTtZQUM5QixTQUFTLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFBRTtTQUNoQyxDQUNGLENBQUM7SUFDSixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQUksQ0FDVCxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsV0FBVyxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQzlELHVCQUF1QixDQUN4QixDQUFDO0lBRUYsT0FBTyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNyRCxDQUFDIn0=
