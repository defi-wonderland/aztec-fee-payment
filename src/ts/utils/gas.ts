import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Gas, GasFees, GasSettings } from "@aztec/stdlib/gas";
import {
  DEFAULT_DA_GAS_LIMIT,
  DEFAULT_L2_GAS_LIMIT,
  DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  DEFAULT_TEARDOWN_L2_GAS_LIMIT,
} from "@aztec/constants";

type BaseFeesProvider = {
  getCurrentMinFees(): Promise<GasFees>;
};

type SimulatedGasEstimate = Pick<
  GasSettings,
  "gasLimits" | "teardownGasLimits"
>;

type SimulatableInteraction = {
  simulate(options: {
    from: AztecAddress;
    additionalScopes?: AztecAddress[];
    includeMetadata?: boolean;
    fee?: {
      paymentMethod?: FeePaymentMethod;
      estimatedGasPadding?: number;
      gasSettings?: {
        gasLimits?: Gas;
        teardownGasLimits?: Gas;
        maxFeesPerGas?: GasFees;
        maxPriorityFeesPerGas?: GasFees;
      };
    };
  }): Promise<{ estimatedGas?: SimulatedGasEstimate }>;
};

const FEE_MULTIPLIER_SCALE = 10_000n;
const DEFAULT_FEE_MULTIPLIER_NUMERATOR = 6n;
const DEFAULT_FEE_MULTIPLIER_DENOMINATOR = 5n;

export type FeeMultiplier =
  | number
  | {
      numerator: bigint;
      denominator: bigint;
    };

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function normalizeMultiplier(multiplier: FeeMultiplier): {
  numerator: bigint;
  denominator: bigint;
} {
  if (typeof multiplier === "number") {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error(
        `Fee multiplier must be a positive finite number, got ${multiplier}`,
      );
    }

    return {
      numerator: BigInt(Math.ceil(multiplier * Number(FEE_MULTIPLIER_SCALE))),
      denominator: FEE_MULTIPLIER_SCALE,
    };
  }

  if (multiplier.denominator <= 0n || multiplier.numerator <= 0n) {
    throw new Error(
      `Fee multiplier must be a positive fraction, got ${multiplier.numerator}/${multiplier.denominator}`,
    );
  }

  return multiplier;
}

/**
 * Default max fee multiplier applied to the node's current minimum fees.
 * Represented as an exact 6/5 fraction so bigint fee values never depend on
 * floating-point multiplication.
 */
export const DEFAULT_FEE_MULTIPLIER = {
  numerator: DEFAULT_FEE_MULTIPLIER_NUMERATOR,
  denominator: DEFAULT_FEE_MULTIPLIER_DENOMINATOR,
} as const;

/**
 * Default padding applied to simulated gas usage when turning it into limits.
 */
export const DEFAULT_GAS_ESTIMATE_PADDING = 0.1;

/**
 * Reasonable default gas limits for most transactions.
 */
export const REASONABLE_GAS_LIMITS = Gas.from({
  daGas: DEFAULT_DA_GAS_LIMIT,
  l2Gas: DEFAULT_L2_GAS_LIMIT,
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
  daGas: DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  l2Gas: DEFAULT_TEARDOWN_L2_GAS_LIMIT,
});

/**
 * Calculate max fees per gas from the node's minimum fees with a multiplier.
 * @param baseFees - The current base fees from the node
 * @param multiplier - Multiplier to apply (default: DEFAULT_FEE_MULTIPLIER)
 * @returns GasFees object with calculated max fees
 */
export function maxFeesPerGasFromBaseFees(
  baseFees: {
    feePerDaGas: string | number | bigint;
    feePerL2Gas: string | number | bigint;
  },
  multiplier: FeeMultiplier = DEFAULT_FEE_MULTIPLIER,
): GasFees {
  const normalizedMultiplier = normalizeMultiplier(multiplier);

  return new GasFees(
    ceilDiv(
      BigInt(baseFees.feePerDaGas) * normalizedMultiplier.numerator,
      normalizedMultiplier.denominator,
    ),
    ceilDiv(
      BigInt(baseFees.feePerL2Gas) * normalizedMultiplier.numerator,
      normalizedMultiplier.denominator,
    ),
  );
}

/**
 * Mirror max fees into priority fees.
 * Aztec models both fee caps independently, but this SDK currently keeps them equal.
 */
export function maxPriorityFeesPerGasFromMaxFees(
  maxFeesPerGas: GasFees,
): GasFees {
  return maxFeesPerGas.clone();
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

/**
 * Simulate an interaction to derive tighter gas limits, then combine them with
 * fee caps based on the node's current minimum fees.
 */
export async function estimateGasSettings(
  interaction: SimulatableInteraction,
  {
    aztecNode,
    from,
    paymentMethod,
    additionalScopes,
    maxFeeMultiplier = DEFAULT_FEE_MULTIPLIER,
    estimatedGasPadding = DEFAULT_GAS_ESTIMATE_PADDING,
    gasLimits = REASONABLE_GAS_LIMITS,
    teardownGasLimits = REASONABLE_TEARDOWN_GAS_LIMITS,
  }: {
    aztecNode: BaseFeesProvider;
    from: AztecAddress;
    paymentMethod?: FeePaymentMethod;
    additionalScopes?: AztecAddress[];
    maxFeeMultiplier?: FeeMultiplier;
    estimatedGasPadding?: number;
    gasLimits?: Gas;
    teardownGasLimits?: Gas;
  },
): Promise<GasSettings> {
  const maxFeesPerGas = maxFeesPerGasFromBaseFees(
    await aztecNode.getCurrentMinFees(),
    maxFeeMultiplier,
  );
  const maxPriorityFeesPerGas = maxPriorityFeesPerGasFromMaxFees(maxFeesPerGas);

  const simulation = await interaction.simulate({
    from,
    additionalScopes,
    includeMetadata: true,
    fee: {
      paymentMethod,
      estimatedGasPadding,
      gasSettings: {
        gasLimits,
        teardownGasLimits,
        maxFeesPerGas,
        maxPriorityFeesPerGas,
      },
    },
  });

  if (!simulation.estimatedGas) {
    throw new Error("Gas estimation metadata was not returned by simulation.");
  }

  return new GasSettings(
    simulation.estimatedGas.gasLimits,
    simulation.estimatedGas.teardownGasLimits,
    maxFeesPerGas,
    maxPriorityFeesPerGas,
  );
}
