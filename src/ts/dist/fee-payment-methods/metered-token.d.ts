import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { Fr } from "@aztec/aztec.js/fields";
/**
 * Fee payment method for the MeteredToken contract.
 * The contract accepts tokens as payment for transaction fees.
 * Uses a 1:1 conversion rate (1 token = 1 FeeJuice equivalent).
 * User must have authorized the transfer via authwit before using this.
 * NOTE: Does not refund unused tokens - use MeteredTokenExactFeePaymentMethod for refunds.
 */
export declare class MeteredTokenFeePaymentMethod implements FeePaymentMethod {
  private readonly fpcAddress;
  private readonly nonce;
  constructor(fpcAddress: AztecAddress, nonce: Fr);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
/**
 * Fee payment method for the MeteredToken contract with exact refunds.
 * Transfers max tokens upfront, then refunds (max - actual) in teardown.
 */
export declare class MeteredTokenExactFeePaymentMethod implements FeePaymentMethod {
  private readonly fpcAddress;
  private readonly nonce;
  constructor(fpcAddress: AztecAddress, nonce: Fr);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
//# sourceMappingURL=metered-token.d.ts.map
