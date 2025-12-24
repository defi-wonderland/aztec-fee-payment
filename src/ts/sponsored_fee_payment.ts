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
 * A fee payment method that calls `sponsor_metered_token(token_address, nonce)` on a FeePayment contract.
 *
 * The contract is expected to:
 * - have enough protocol FeeJuice to actually pay the tx fee, AND
 * - be able to pull the reserved max gas cost (in tokens) from the tx sender's *private* token balance
 *   via an authwit authorizing the FeePayment contract to call Token.transfer_private_to_public(...).
 */
export class MeteredTokenSponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(
    private readonly paymentContract: AztecAddress,
    private readonly tokenAddress: AztecAddress,
    private readonly nonce: Fr,
  ) {}

  getAsset(): Promise<AztecAddress> {
    return Promise.resolve(this.tokenAddress);
  }

  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: "sponsor_metered_token",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature(
            "sponsor_metered_token((Field),Field)",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [this.tokenAddress.toField(), this.nonce],
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
 * A fee payment method that calls `sponsor_metered_token_exact(token_address, nonce)` on a FeePayment contract.
 *
 * Same as metered-token, but refunds any surplus (max fees - base fees) in teardown.
 */
export class MeteredExactTokenSponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(
    private readonly paymentContract: AztecAddress,
    private readonly tokenAddress: AztecAddress,
    private readonly nonce: Fr,
  ) {}

  getAsset(): Promise<AztecAddress> {
    return Promise.resolve(this.tokenAddress);
  }

  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: "sponsor_metered_token_exact",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature(
            "sponsor_metered_token_exact((Field),Field)",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [this.tokenAddress.toField(), this.nonce],
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
