import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * A fee payment method that calls `sponsor_metered()` on a FeePayment contract.
 * The contract is expected to:
 * - have enough protocol FeeJuice to actually pay the tx fee, AND
 * - have enough internal `fee_juice_balance` to reserve/subtract `max_gas_cost`.
 */
export declare class MeteredSponsoredFeePaymentMethod implements FeePaymentMethod {
  private paymentContract;
  constructor(paymentContract: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
/**
 * A fee payment method that calls `sponsor_metered_exact()` on a FeePayment contract.
 * The contract is expected to:
 * - have enough protocol FeeJuice to actually pay the tx fee, AND
 * - have enough internal `fee_juice_balance` to reserve/subtract `max_gas_cost`,
 *   then refund any surplus in teardown.
 */
export declare class MeteredExactSponsoredFeePaymentMethod implements FeePaymentMethod {
  private paymentContract;
  constructor(paymentContract: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
/**
 * A fee payment method that calls `sponsor_metered_teardown_revert()` on a FeePayment contract.
 *
 * This is mainly useful in tests to force a `TEARDOWN_REVERTED` tx status without involving tokens.
 */
export declare class TeardownRevertMeteredSponsoredFeePaymentMethod implements FeePaymentMethod {
  private paymentContract;
  constructor(paymentContract: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
//# sourceMappingURL=metered.d.ts.map
