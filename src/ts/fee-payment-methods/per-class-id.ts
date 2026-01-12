import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";

/**
 * Fee payment method for the PerClassId contract.
 * The contract only sponsors transactions from accounts of a specific contract class.
 * The allowed class ID is set at deployment time (immutable).
 */
export class PerClassIdFeePaymentMethod implements FeePaymentMethod {
  constructor(private readonly fpcAddress: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for per-class-id fee payment.");
  }

  getFeePayer() {
    return Promise.resolve(this.fpcAddress);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: "pay_fee",
          to: this.fpcAddress,
          selector: await FunctionSelector.fromSignature("pay_fee()"),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [],
          returnTypes: [],
        },
      ],
      [],
      [],
      [],
      this.fpcAddress,
    );
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}
