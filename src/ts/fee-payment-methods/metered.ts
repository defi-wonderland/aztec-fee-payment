import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";

/**
 * Fee payment method for the Metered contract.
 * The contract tracks internal balances and deducts max gas cost per transaction.
 * Users must have sufficient balance (via `mint()`) to cover estimated fees.
 * NOTE: Does not refund unused gas - use MeteredExactFeePaymentMethod for refunds.
 */
export class MeteredFeePaymentMethod implements FeePaymentMethod {
  constructor(private readonly fpcAddress: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for metered fee payment.");
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
    // TODO: Implement?
    return;
  }
}

/**
 * Fee payment method for the Metered contract with exact refunds.
 * Deducts max gas cost upfront, then refunds (max - actual) in teardown.
 */
export class MeteredExactFeePaymentMethod implements FeePaymentMethod {
  constructor(private readonly fpcAddress: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for metered fee payment.");
  }

  getFeePayer() {
    return Promise.resolve(this.fpcAddress);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: "pay_fee_exact",
          to: this.fpcAddress,
          selector: await FunctionSelector.fromSignature("pay_fee_exact()"),
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
    // TODO: Implement?
    return;
  }
}
