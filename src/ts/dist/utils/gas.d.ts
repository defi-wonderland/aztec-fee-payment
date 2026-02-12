import { Gas, GasFees } from "@aztec/stdlib/gas";
/**
 * Reasonable default gas limits for most transactions.
 */
export declare const REASONABLE_GAS_LIMITS: Gas;
/**
 * Reasonable default teardown gas limits for most transactions.
 */
export declare const REASONABLE_TEARDOWN_GAS_LIMITS: Gas;
/**
 * Calculate max fees per gas from base fees with a multiplier.
 * @param baseFees - The current base fees from the node
 * @param multiplier - Multiplier to apply (default: 3n for safety margin)
 * @returns GasFees object with calculated max fees
 */
export declare function maxFeesPerGasFromBaseFees(baseFees: {
    feePerDaGas: string | number | bigint;
    feePerL2Gas: string | number | bigint;
}, multiplier?: bigint): GasFees;
/**
 * Calculate the maximum gas cost for a transaction.
 * @param maxFeesPerGas - Maximum fees per gas unit
 * @param gasLimits - Gas limits for the main execution
 * @param teardownGasLimits - Gas limits for the teardown phase
 * @returns Maximum possible gas cost in wei
 */
export declare function maxGasCostFor(maxFeesPerGas: GasFees, gasLimits: Gas, teardownGasLimits: Gas): bigint;
//# sourceMappingURL=gas.d.ts.map