import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * Fee payment method for the PerClassId contract.
 * The contract only sponsors transactions from accounts of a specific contract class.
 * The allowed class ID is set at deployment time (immutable).
 */
export declare class PerClassIdFeePaymentMethod implements FeePaymentMethod {
  private readonly fpcAddress;
  constructor(fpcAddress: AztecAddress);
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
//# sourceMappingURL=per-class-id.d.ts.map
