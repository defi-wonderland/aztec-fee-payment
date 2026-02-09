import { decodeEventLog } from "viem";
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
];
/**
 * Parse all ERC20 Transfer events from a transaction receipt.
 */
export function parseTransferEvents(receipt) {
  const transfers = [];
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ERC20_TRANSFER_EVENT_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Transfer") {
        transfers.push({
          token: log.address,
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
  transfers,
  feeCollectorAddress,
  aztTokenAddress,
) {
  const feeCollectorLower = feeCollectorAddress.toLowerCase();
  const aztTokenLower = aztTokenAddress.toLowerCase();
  return transfers.filter(
    (t) =>
      t.to.toLowerCase() === feeCollectorLower &&
      t.token.toLowerCase() === aztTokenLower,
  );
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vYWdlbnQvc2VydmljZXMvZXZtL3BhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsY0FBYyxFQUF5QyxNQUFNLE1BQU0sQ0FBQztBQUU3RSxNQUFNLHdCQUF3QixHQUFHO0lBQy9CO1FBQ0UsSUFBSSxFQUFFLE9BQU87UUFDYixJQUFJLEVBQUUsVUFBVTtRQUNoQixNQUFNLEVBQUU7WUFDTixFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFO1lBQ2hELEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7WUFDOUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRTtTQUNuRDtLQUNGO0NBQ08sQ0FBQztBQVNYOztHQUVHO0FBQ0gsTUFBTSxVQUFVLG1CQUFtQixDQUNqQyxPQUEyQjtJQUUzQixNQUFNLFNBQVMsR0FBcUIsRUFBRSxDQUFDO0lBRXZDLEtBQUssTUFBTSxHQUFHLElBQUksT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQztZQUNILE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQztnQkFDN0IsR0FBRyxFQUFFLHdCQUF3QjtnQkFDN0IsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJO2dCQUNkLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTTthQUNuQixDQUFDLENBQUM7WUFFSCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQ3JDLFNBQVMsQ0FBQyxJQUFJLENBQUM7b0JBQ2IsS0FBSyxFQUFFLEdBQUcsQ0FBQyxPQUFrQjtvQkFDN0IsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSTtvQkFDdkIsRUFBRSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSztpQkFDM0IsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUCw4QkFBOEI7UUFDaEMsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQztBQUNuQixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHlCQUF5QixDQUN2QyxTQUEyQixFQUMzQixtQkFBNEIsRUFDNUIsZUFBd0I7SUFFeEIsTUFBTSxpQkFBaUIsR0FBRyxtQkFBbUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM1RCxNQUFNLGFBQWEsR0FBRyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUM7SUFFcEQsT0FBTyxTQUFTLENBQUMsTUFBTSxDQUNyQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQ0osQ0FBQyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsS0FBSyxpQkFBaUI7UUFDeEMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsS0FBSyxhQUFhLENBQzFDLENBQUM7QUFDSixDQUFDIn0=
