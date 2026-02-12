import { Gas, GasFees } from "@aztec/stdlib/gas";
import {
  DEFAULT_DA_GAS_LIMIT,
  DEFAULT_L2_GAS_LIMIT,
  DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  DEFAULT_TEARDOWN_L2_GAS_LIMIT,
} from "@aztec/constants";
/**
 * Reasonable default gas limits for most transactions.
 */
export const REASONABLE_GAS_LIMITS = Gas.from({
  daGas: DEFAULT_DA_GAS_LIMIT,
  l2Gas: DEFAULT_L2_GAS_LIMIT,
});
/**
 * Reasonable default teardown gas limits for most transactions.
 */
export const REASONABLE_TEARDOWN_GAS_LIMITS = Gas.from({
  daGas: DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  l2Gas: DEFAULT_TEARDOWN_L2_GAS_LIMIT,
});
/**
 * Calculate max fees per gas from base fees with a multiplier.
 * @param baseFees - The current base fees from the node
 * @param multiplier - Multiplier to apply (default: 3n for safety margin)
 * @returns GasFees object with calculated max fees
 */
export function maxFeesPerGasFromBaseFees(baseFees, multiplier = 3n) {
  return new GasFees(
    BigInt(baseFees.feePerDaGas) * multiplier,
    BigInt(baseFees.feePerL2Gas) * multiplier,
  );
}
/**
 * Calculate the maximum gas cost for a transaction.
 * @param maxFeesPerGas - Maximum fees per gas unit
 * @param gasLimits - Gas limits for the main execution
 * @param teardownGasLimits - Gas limits for the teardown phase
 * @returns Maximum possible gas cost in wei
 */
export function maxGasCostFor(maxFeesPerGas, gasLimits, teardownGasLimits) {
  return (
    BigInt(maxFeesPerGas.feePerDaGas) *
      (BigInt(gasLimits.daGas) + BigInt(teardownGasLimits.daGas)) +
    BigInt(maxFeesPerGas.feePerL2Gas) *
      (BigInt(gasLimits.l2Gas) + BigInt(teardownGasLimits.l2Gas))
  );
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2FzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdXRpbHMvZ2FzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDakQsT0FBTyxFQUNMLG9CQUFvQixFQUNwQixvQkFBb0IsRUFDcEIsNkJBQTZCLEVBQzdCLDZCQUE2QixHQUM5QixNQUFNLGtCQUFrQixDQUFDO0FBRTFCOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztJQUM1QyxLQUFLLEVBQUUsb0JBQW9CO0lBQzNCLEtBQUssRUFBRSxvQkFBb0I7Q0FDNUIsQ0FBQyxDQUFDO0FBRUg7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSw4QkFBOEIsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO0lBQ3JELEtBQUssRUFBRSw2QkFBNkI7SUFDcEMsS0FBSyxFQUFFLDZCQUE2QjtDQUNyQyxDQUFDLENBQUM7QUFFSDs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSx5QkFBeUIsQ0FDdkMsUUFHQyxFQUNELGFBQXFCLEVBQUU7SUFFdkIsT0FBTyxJQUFJLE9BQU8sQ0FDaEIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsR0FBRyxVQUFVLEVBQ3pDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLEdBQUcsVUFBVSxDQUMxQyxDQUFDO0FBQ0osQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxhQUFhLENBQzNCLGFBQXNCLEVBQ3RCLFNBQWMsRUFDZCxpQkFBc0I7SUFFdEIsT0FBTyxDQUNMLE1BQU0sQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDO1FBQy9CLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0QsTUFBTSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUM7WUFDL0IsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUM5RCxDQUFDO0FBQ0osQ0FBQyJ9
