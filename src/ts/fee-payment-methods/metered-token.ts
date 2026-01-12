import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
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
export class MeteredTokenFeePaymentMethod implements FeePaymentMethod {
  constructor(
    private readonly fpcAddress: AztecAddress,
    private readonly nonce: Fr,
  ) {}

  getAsset(): Promise<AztecAddress> {
    // TODO: Read from contract at class construction time
    throw new Error("Token address is stored in the contract.");
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
          selector: await FunctionSelector.fromSignature("pay_fee(Field)"),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [this.nonce],
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
 * Fee payment method for the MeteredToken contract with exact refunds.
 * Transfers max tokens upfront, then refunds (max - actual) in teardown.
 */
export class MeteredTokenExactFeePaymentMethod implements FeePaymentMethod {
  constructor(
    private readonly fpcAddress: AztecAddress,
    private readonly nonce: Fr,
  ) {}

  getAsset(): Promise<AztecAddress> {
    // TODO: Read from contract at class construction time
    throw new Error("Token address is stored in the contract.");
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
          selector: await FunctionSelector.fromSignature(
            "pay_fee_exact(Field)",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [this.nonce],
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
