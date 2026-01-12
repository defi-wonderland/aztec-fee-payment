import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * Fee payment method for the Metered contract.
 * The contract tracks internal balances and deducts max gas cost per transaction.
 * Users must have sufficient balance (via `mint()`) to cover estimated fees.
 * NOTE: Does not refund unused gas - use MeteredExactFeePaymentMethod for refunds.
 */
export declare class MeteredFeePaymentMethod implements FeePaymentMethod {
  private readonly fpcAddress;
  constructor(fpcAddress: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
/**
 * Fee payment method for the Metered contract with exact refunds.
 * Deducts max gas cost upfront, then refunds (max - actual) in teardown.
 */
export declare class MeteredExactFeePaymentMethod implements FeePaymentMethod {
  private readonly fpcAddress;
  constructor(fpcAddress: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
//# sourceMappingURL=metered.d.ts.map
