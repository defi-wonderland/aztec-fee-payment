import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";

/**
 * A fee payment method that calls `sponsor_metered()` on a FeePayment contract.
 * The contract is expected to:
 * - have enough protocol FeeJuice to actually pay the tx fee, AND
 * - have enough internal `fee_juice_balance` to reserve/subtract `max_gas_cost`.
 */
export class MeteredSponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(private paymentContract: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for sponsored fpc.");
  }

  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: "sponsor_metered",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature("sponsor_metered()"),
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
      this.paymentContract, // feePayer
    );
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}

/**
 * A fee payment method that calls `sponsor_metered_exact()` on a FeePayment contract.
 * The contract is expected to:
 * - have enough protocol FeeJuice to actually pay the tx fee, AND
 * - have enough internal `fee_juice_balance` to reserve/subtract `max_gas_cost`,
 *   then refund any surplus in teardown.
 */
export class MeteredExactSponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(private paymentContract: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for sponsored fpc.");
  }

  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: "sponsor_metered_exact",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature(
            "sponsor_metered_exact()",
          ),
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
      this.paymentContract, // feePayer
    );
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}

/**
 * A fee payment method that calls `sponsor_metered_teardown_revert()` on a FeePayment contract.
 *
 * This is mainly useful in tests to force a `TEARDOWN_REVERTED` tx status without involving tokens.
 */
export class TeardownRevertMeteredSponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(private paymentContract: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for sponsored fpc.");
  }

  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: "sponsor_metered_teardown_revert",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature(
            "sponsor_metered_teardown_revert()",
          ),
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
      this.paymentContract, // feePayer
    );
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}
