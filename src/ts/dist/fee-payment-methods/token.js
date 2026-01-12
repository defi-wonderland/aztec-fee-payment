import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * A fee payment method that calls `sponsor_metered_token(token_address, nonce)` on a FeePayment contract.
 *
 * The contract is expected to:
 * - have enough protocol FeeJuice to actually pay the tx fee, AND
 * - be able to pull the reserved max gas cost (in tokens) from the tx sender's *private* token balance
 *   via an authwit authorizing the FeePayment contract to call Token.transfer_private_to_public(...).
 */
export class MeteredTokenSponsoredFeePaymentMethod {
  constructor(paymentContract, tokenAddress, nonce) {
    this.paymentContract = paymentContract;
    this.tokenAddress = tokenAddress;
    this.nonce = nonce;
  }
  getAsset() {
    return Promise.resolve(this.tokenAddress);
  }
  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }
  async getExecutionPayload() {
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
      this.paymentContract,
    );
  }
  getGasSettings() {
    return;
  }
}
/**
 * A fee payment method that calls `sponsor_metered_token_exact(token_address, nonce)` on a FeePayment contract.
 *
 * Same as metered-token, but refunds any surplus (max fees - base fees) in teardown.
 */
export class MeteredExactTokenSponsoredFeePaymentMethod {
  constructor(paymentContract, tokenAddress, nonce) {
    this.paymentContract = paymentContract;
    this.tokenAddress = tokenAddress;
    this.nonce = nonce;
  }
  getAsset() {
    return Promise.resolve(this.tokenAddress);
  }
  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }
  async getExecutionPayload() {
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
      this.paymentContract,
    );
  }
  getGasSettings() {
    return;
  }
}
/**
 * A fee payment method that calls `sponsor_metered_token_teardown_revert(token_address, nonce)` on a FeePayment contract.
 *
 * This is mainly useful in tests to force a `TEARDOWN_REVERTED` tx status.
 */
export class TeardownRevertTokenSponsoredFeePaymentMethod {
  constructor(paymentContract, tokenAddress, nonce) {
    this.paymentContract = paymentContract;
    this.tokenAddress = tokenAddress;
    this.nonce = nonce;
  }
  getAsset() {
    return Promise.resolve(this.tokenAddress);
  }
  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }
  async getExecutionPayload() {
    return new ExecutionPayload(
      [
        {
          name: "sponsor_metered_token_teardown_revert",
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature(
            "sponsor_metered_token_teardown_revert((Field),Field)",
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
      this.paymentContract,
    );
  }
  getGasSettings() {
    return;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9mZWUtcGF5bWVudC1tZXRob2RzL3Rva2VuLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUduRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUdwRDs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxPQUFPLHFDQUFxQztJQUNoRCxZQUNtQixlQUE2QixFQUM3QixZQUEwQixFQUMxQixLQUFTO1FBRlQsb0JBQWUsR0FBZixlQUFlLENBQWM7UUFDN0IsaUJBQVksR0FBWixZQUFZLENBQWM7UUFDMUIsVUFBSyxHQUFMLEtBQUssQ0FBSTtJQUN6QixDQUFDO0lBRUosUUFBUTtRQUNOLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELFdBQVc7UUFDVCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CO1FBQ3ZCLE9BQU8sSUFBSSxnQkFBZ0IsQ0FDekI7WUFDRTtnQkFDRSxJQUFJLEVBQUUsdUJBQXVCO2dCQUM3QixFQUFFLEVBQUUsSUFBSSxDQUFDLGVBQWU7Z0JBQ3hCLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDLGFBQWEsQ0FDNUMsc0NBQXNDLENBQ3ZDO2dCQUNELElBQUksRUFBRSxZQUFZLENBQUMsT0FBTztnQkFDMUIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFDL0MsV0FBVyxFQUFFLEVBQUU7YUFDaEI7U0FDRixFQUNELEVB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
