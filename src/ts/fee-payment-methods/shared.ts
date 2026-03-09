import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import {
  FunctionCall,
  FunctionSelector,
  FunctionType,
} from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";

/**
 * Generic fee payment method compatible with any FPC contract that implements pay_fee().
 * Deducts max gas cost from the sender's internal balance. Does not refund unused gas.
 * Suitable for any FPC that implements pay_fee().
 *
 * Use FPCExactFeePaymentMethod for transactions that need unused gas refunded.
 */
export class FPCFeePaymentMethod implements FeePaymentMethod {
  constructor(private readonly fpcAddress: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for FPC fee payment.");
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.fpcAddress);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: "pay_fee",
          to: this.fpcAddress,
          selector: await FunctionSelector.fromSignature("pay_fee()"),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [],
          returnTypes: [],
        }),
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

/**
 * Generic fee payment method compatible with any FPC contract that implements pay_fee_exact().
 * Deducts max gas cost upfront, then refunds (max - actual) in the teardown phase via a partial note.
 *
 * Use REASONABLE_TEARDOWN_GAS_LIMITS in the transaction's gasSettings to budget the teardown phase.
 */
export class FPCExactFeePaymentMethod implements FeePaymentMethod {
  constructor(private readonly fpcAddress: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for FPC fee payment.");
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.fpcAddress);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: "pay_fee_exact",
          to: this.fpcAddress,
          selector: await FunctionSelector.fromSignature("pay_fee_exact()"),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [],
          returnTypes: [],
        }),
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
