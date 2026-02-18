import { Gas, GasFees } from "@aztec/stdlib/gas";
import {
  DEFAULT_DA_GAS_LIMIT,
  DEFAULT_L2_GAS_LIMIT,
  DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  DEFAULT_TEARDOWN_L2_GAS_LIMIT,
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
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
 * Gas limits the wallet actually uses during gas estimation.
 * The wallet's `completeFeeOptionsForEstimation` overrides any user-provided
 * gas limits with these hard-coded constants, so note sizing and maxGasCost
 * computations must use them to match what the contract sees at runtime.
 */
export const ESTIMATION_GAS_LIMITS = Gas.from({
  daGas: GAS_ESTIMATION_DA_GAS_LIMIT,
  l2Gas: GAS_ESTIMATION_L2_GAS_LIMIT,
});

/**
 * Teardown gas limits the wallet actually uses during gas estimation.
 * @see ESTIMATION_GAS_LIMITS
 */
export const ESTIMATION_TEARDOWN_GAS_LIMITS = Gas.from({
  daGas: GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  l2Gas: GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
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
