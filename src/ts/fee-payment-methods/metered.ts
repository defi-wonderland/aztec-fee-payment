import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import {
  FunctionCall,
  FunctionSelector,
  FunctionType,
} from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { Fr } from "@aztec/foundation/curves/bn254";
import { AuthWitness } from "@aztec/stdlib/auth-witness";

/**
 * Fee payment method for the MeteredFPC contract.
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

/**
 * Fee payment method that mints and pays fee in a single transaction.
 * Verifies authorization via the owner's account contract, mints the specified amount,
 * then deducts max gas cost. The minted amount must be >= max_gas_cost.
 */
export class MeteredMintAndPayFeePaymentMethod implements FeePaymentMethod {
  constructor(
    private readonly fpcAddress: AztecAddress,
    private readonly account: AztecAddress,
    private readonly amount: bigint,
    private readonly secret: Fr,
    private readonly authWitness: AuthWitness,
  ) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for metered fee payment.");
  }

  getFeePayer() {
    return Promise.resolve(this.fpcAddress);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: "mint_and_pay_fee",
          to: this.fpcAddress,
          selector: await FunctionSelector.fromSignature(
            "mint_and_pay_fee((Field),u128,Field)",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [this.account.toField(), new Fr(this.amount), this.secret],
          returnTypes: [],
        }),
      ],
      [this.authWitness],
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
 * Fee payment method that mints tokens first, then pays fee from balance.
 * This is a two-step flow: mint creates notes, then pay_fee consumes them.
 * Useful when you want to separate minting from fee payment.
 */
export class MeteredMintThenPayFeePaymentMethod implements FeePaymentMethod {
  constructor(
    private readonly fpcAddress: AztecAddress,
    private readonly account: AztecAddress,
    private readonly amount: bigint,
    private readonly secret: Fr,
    private readonly authWitness: AuthWitness,
  ) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for metered fee payment.");
  }

  getFeePayer() {
    return Promise.resolve(this.fpcAddress);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: "mint",
          to: this.fpcAddress,
          selector: await FunctionSelector.fromSignature(
            "mint((Field),u128,Field)",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [this.account.toField(), new Fr(this.amount), this.secret],
          returnTypes: [],
        }),
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
      [this.authWitness],
      [],
      [],
      this.fpcAddress,
    );
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}
