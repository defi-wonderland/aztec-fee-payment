import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * Fee payment method for the Unconditional contract.
 * The contract sponsors all transactions without conditions.
 */
export declare class UnconditionalFeePaymentMethod implements FeePaymentMethod {
  private readonly fpcAddress;
  constructor(fpcAddress: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
//# sourceMappingURL=unconditional.d.ts.map
