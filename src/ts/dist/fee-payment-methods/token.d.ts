import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { Fr } from "@aztec/aztec.js/fields";
/**
 * A fee payment method that calls `sponsor_metered_token(token_address, nonce)` on a FeePayment contract.
 *
 * The contract is expected to:
 * - have enough protocol FeeJuice to actually pay the tx fee, AND
 * - be able to pull the reserved max gas cost (in tokens) from the tx sender's *private* token balance
 *   via an authwit authorizing the FeePayment contract to call Token.transfer_private_to_public(...).
 */
export declare class MeteredTokenSponsoredFeePaymentMethod implements FeePaymentMethod {
  private readonly paymentContract;
  private readonly tokenAddress;
  private readonly nonce;
  constructor(
    paymentContract: AztecAddress,
    tokenAddress: AztecAddress,
    nonce: Fr,
  );
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
/**
 * A fee payment method that calls `sponsor_metered_token_exact(token_address, nonce)` on a FeePayment contract.
 *
 * Same as metered-token, but refunds any surplus (max fees - base fees) in teardown.
 */
export declare class MeteredExactTokenSponsoredFeePaymentMethod implements FeePaymentMethod {
  private readonly paymentContract;
  private readonly tokenAddress;
  private readonly nonce;
  constructor(
    paymentContract: AztecAddress,
    tokenAddress: AztecAddress,
    nonce: Fr,
  );
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
/**
 * A fee payment method that calls `sponsor_metered_token_teardown_revert(token_address, nonce)` on a FeePayment contract.
 *
 * This is mainly useful in tests to force a `TEARDOWN_REVERTED` tx status.
 */
export declare class TeardownRevertTokenSponsoredFeePaymentMethod implements FeePaymentMethod {
  private readonly paymentContract;
  private readonly tokenAddress;
  private readonly nonce;
  constructor(
    paymentContract: AztecAddress,
    tokenAddress: AztecAddress,
    nonce: Fr,
  );
  getAsset(): Promise<AztecAddress>;
  getFeePayer(): Promise<AztecAddress>;
  getExecutionPayload(): Promise<ExecutionPayload>;
  getGasSettings(): GasSettings | undefined;
}
//# sourceMappingURL=token.d.ts.map
