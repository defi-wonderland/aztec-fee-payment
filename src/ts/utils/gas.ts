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
export function maxFeesPerGasFromBaseFees(
  baseFees: {
    feePerDaGas: string | number | bigint;
    feePerL2Gas: string | number | bigint;
  },
  multiplier: bigint = 3n,
): GasFees {
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
export function maxGasCostFor(
  maxFeesPerGas: GasFees,
  gasLimits: Gas,
  teardownGasLimits: Gas,
): bigint {
  return (
    BigInt(maxFeesPerGas.feePerDaGas) *
      (BigInt(gasLimits.daGas) + BigInt(teardownGasLimits.daGas)) +
    BigInt(maxFeesPerGas.feePerL2Gas) *
      (BigInt(gasLimits.l2Gas) + BigInt(teardownGasLimits.l2Gas))
  );
}
