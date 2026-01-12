import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { Fr } from "@aztec/aztec.js/fields";

/**
 * A fee payment method that uses a contract that blindly sponsors transactions.
 * This contract is expected to be prefunded in testing environments.
 */
export class SponsoredFeePaymentMethod implements FeePaymentMethod {
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
          name: "sponsor_unconditionally",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature(
            "sponsor_unconditionally()",
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
export class ClassIdValidatedSponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(
    private readonly paymentContract: AztecAddress,
    private readonly expectedClassId: Fr,
  ) {}

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
          name: "sponsor_for_class_id",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature(
            "sponsor_for_class_id((Field))",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [this.expectedClassId],
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
 * A fee payment method that calls `sponsor_unconditionally_teardown_revert()` on a FeePayment contract.
 *
 * This is mainly useful in tests to force a `TEARDOWN_REVERTED` tx status without involving tokens.
 */
export class TeardownRevertSponsoredFeePaymentMethod implements FeePaymentMethod {
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
          name: "sponsor_unconditionally_teardown_revert",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature(
            "sponsor_unconditionally_teardown_revert()",
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
