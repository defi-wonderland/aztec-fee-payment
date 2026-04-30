import {
  Gas,
  GasFees,
  APPROXIMATE_MAX_DA_GAS_PER_BLOCK,
  FALLBACK_TEARDOWN_DA_GAS_LIMIT,
  FALLBACK_TEARDOWN_L2_GAS_LIMIT,
} from "@aztec/stdlib/gas";
import { MAX_PROCESSABLE_L2_GAS } from "@aztec/constants";

/**
 * Default safety multiplier applied to base fees.
 * Provides headroom above the current minimum to avoid rejection under fee spikes.
 */
export const DEFAULT_FEE_MULTIPLIER = 3n;

/**
 * Reasonable default gas limits for most transactions.
 */
export const REASONABLE_GAS_LIMITS = Gas.from({
  daGas: APPROXIMATE_MAX_DA_GAS_PER_BLOCK,
  l2Gas: MAX_PROCESSABLE_L2_GAS,
});

/**
 * Teardown gas limits for transactions that use pay_fee_exact().
 *
 * These are Aztec's protocol-wide defaults (DEFAULT_TEARDOWN_DA_GAS_LIMIT = 393,216;
 * DEFAULT_TEARDOWN_L2_GAS_LIMIT = 1,000,000). They are NOT calibrated to the _refund
 * teardown function, which only emits one note hash and costs roughly 40-50k L2 gas
 * in practice (~20x cheaper than this limit).
 *
 * The protocol bills teardown gas at the limit (rather than actual usage), this
 * overestimate inflates the cost of every pay_fee_exact transaction. Consider
 * benchmarking _refund's actual gas consumption and replacing this with a tighter
 * constant.
 *
 * NOTE: teardown gas is already included in the gas_limits fee calculation by the protocol,
 * so this must NOT be passed to maxGasCostFor (that would double-count teardown cost).
 */
export const REASONABLE_TEARDOWN_GAS_LIMITS = Gas.from({
  daGas: FALLBACK_TEARDOWN_DA_GAS_LIMIT,
  l2Gas: FALLBACK_TEARDOWN_L2_GAS_LIMIT,
});

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
 * Teardown gas is already accounted for inside gasLimits by the protocol
 * (the kernel's gas_meter includes teardown in the overall fee computation),
 * so teardownGasLimits must NOT be added again here — doing so would
 * double-count the teardown cost.
 *
 * @param maxFeesPerGas - Maximum fees per gas unit
 * @param gasLimits - Gas limits for the transaction (already covers teardown allocation)
 * @returns Maximum possible gas cost in wei
 */
export function maxGasCostFor(maxFeesPerGas: GasFees, gasLimits: Gas): bigint {
  return (
    BigInt(maxFeesPerGas.feePerDaGas) * BigInt(gasLimits.daGas) +
    BigInt(maxFeesPerGas.feePerL2Gas) * BigInt(gasLimits.l2Gas)
  );
}
