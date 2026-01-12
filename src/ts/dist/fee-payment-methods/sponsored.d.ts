import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { Fr } from "@aztec/aztec.js/fields";
/**
 * A fee payment method that uses a contract that blindly sponsors transactions.
 * This contract is expected to be prefunded in testing environments.
 */
export declare class SponsoredFeePaymentMethod implements FeePaymentMethod {
  private paymentContract;
  constructor(paymentContract: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
/**
 * A fee payment method that validates the caller's contract class ID before sponsoring.
 * This calls `sponsor_for_class_id(expected_class_id)` on a FeePayment contract.
 *
 * The contract will:
 * - Fetch the caller's contract instance via oracle
 * - Verify the instance by checking the address derivation
 * - Assert the caller's class ID matches the expected class ID
 * - Only then sponsor the transaction
 *
 * This is useful for restricting fee sponsorship to specific account contract types
 * (e.g., only sponsor transactions from SchnorrAccountContract wallets).
 */
export declare class ClassIdValidatedSponsoredFeePaymentMethod implements FeePaymentMethod {
  private readonly paymentContract;
  private readonly expectedClassId;
  constructor(paymentContract: AztecAddress, expectedClassId: Fr);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
/**
 * A fee payment method that calls `sponsor_unconditionally_teardown_revert()` on a FeePayment contract.
 *
 * This is mainly useful in tests to force a `TEARDOWN_REVERTED` tx status without involving tokens.
 */
export declare class TeardownRevertSponsoredFeePaymentMethod implements FeePaymentMethod {
  private paymentContract;
  constructor(paymentContract: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
//# sourceMappingURL=sponsored.d.ts.map
