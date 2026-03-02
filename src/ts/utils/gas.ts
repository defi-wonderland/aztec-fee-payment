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
 * Default safety multiplier applied to base fees when estimating max fees per gas.
 * A 3× buffer guards against fee spikes between simulation and inclusion.
 */
export const DEFAULT_FEE_MULTIPLIER = 3n;

/**
 * Calculate max fees per gas from base fees with a multiplier.
 * @param baseFees - The current base fees from the node
 * @param multiplier - Multiplier to apply (default: DEFAULT_FEE_MULTIPLIER)
 * @returns GasFees object with calculated max fees
 */
export function maxFeesPerGasFromBaseFees(
  baseFees: {
    feePerDaGas: string | number | bigint;
    feePerL2Gas: string | number | bigint;
  },
  multiplier: bigint = DEFAULT_FEE_MULTIPLIER,
): GasFees {
  return new GasFees(
    BigInt(baseFees.feePerDaGas) * multiplier,
    BigInt(baseFees.feePerL2Gas) * multiplier,
  );
}

/**
 * Calculate the maximum gas cost for a transaction.
 *
 * Matches the protocol's GasSettings.getFeeLimit(): `maxFeesPerGas * gasLimits`.
 * teardownGasLimits is intentionally excluded — it is a sub-budget drawn from
 * within gasLimits, not an additional budget on top.
 *
 * @param maxFeesPerGas - Maximum fees per gas unit
 * @param gasLimits - Total gas limits (covers both main execution and teardown sub-budget)
 * @returns Maximum possible gas cost in wei
 */
export function maxGasCostFor(maxFeesPerGas: GasFees, gasLimits: Gas): bigint {
  return (
    BigInt(maxFeesPerGas.feePerDaGas) * BigInt(gasLimits.daGas) +
    BigInt(maxFeesPerGas.feePerL2Gas) * BigInt(gasLimits.l2Gas)
  );
}
