import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * Fee payment method for the MeteredToken contract.
 * The contract accepts tokens as payment for transaction fees.
 * Uses a 1:1 conversion rate (1 token = 1 FeeJuice equivalent).
 * User must have authorized the transfer via authwit before using this.
 * NOTE: Does not refund unused tokens - use MeteredTokenExactFeePaymentMethod for refunds.
 */
export class MeteredTokenFeePaymentMethod {
  constructor(fpcAddress, nonce) {
    this.fpcAddress = fpcAddress;
    this.nonce = nonce;
  }
  getAsset() {
    // Token address is stored in the contract - not needed here
    throw new Error("Token address is stored in the contract.");
  }
  getFeePayer() {
    return Promise.resolve(this.fpcAddress);
  }
  async getExecutionPayload() {
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
  getGasSettings() {
    return;
  }
}
/**
 * Fee payment method for the MeteredToken contract with exact refunds.
 * Transfers max tokens upfront, then refunds (max - actual) in teardown.
 */
export class MeteredTokenExactFeePaymentMethod {
  constructor(fpcAddress, nonce) {
    this.fpcAddress = fpcAddress;
    this.nonce = nonce;
  }
  getAsset() {
    throw new Error("Token address is stored in the contract.");
  }
  getFeePayer() {
    return Promise.resolve(this.fpcAddress);
  }
  async getExecutionPayload() {
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
  getGasSettings() {
    return;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZC10b2tlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2ZlZS1wYXltZW50LW1ldGhvZHMvbWV0ZXJlZC10b2tlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFHbkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFHcEQ7Ozs7OztHQU1HO0FBQ0gsTUFBTSxPQUFPLDRCQUE0QjtJQUN2QyxZQUNtQixVQUF3QixFQUN4QixLQUFTO1FBRFQsZUFBVSxHQUFWLFVBQVUsQ0FBYztRQUN4QixVQUFLLEdBQUwsS0FBSyxDQUFJO0lBQ3pCLENBQUM7SUFFSixRQUFRO1FBQ04sNERBQTREO1FBQzVELE1BQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsV0FBVztRQUNULE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDdkIsT0FBTyxJQUFJLGdCQUFnQixDQUN6QjtZQUNFO2dCQUNFLElBQUksRUFBRSxTQUFTO2dCQUNmLEVBQUUsRUFBRSxJQUFJLENBQUMsVUFBVTtnQkFDbkIsUUFBUSxFQUFFLE1BQU0sZ0JBQWdCLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDO2dCQUNoRSxJQUFJLEVBQUUsWUFBWSxDQUFDLE9BQU87Z0JBQzFCLGFBQWEsRUFBRSxLQUFLO2dCQUNwQixRQUFRLEVBQUUsS0FBSztnQkFDZixJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO2dCQUNsQixXQUFXLEVBQUUsRUFBRTthQUNoQjtTQUNGLEVBQ0QsRUFBRSxFQUNGLEVBQUUsRUFDRixFQUFFLEVBQ0YsSUFBSSxDQUFDLFVBQVUsQ0FDaEIsQ0FBQztJQUNKLENBQUM7SUFFRCxjQUFjO1FBQ1osT0FBTztJQUNULENBQUM7Q0FDRjtBQUVEOzs7R0FHRztBQUNILE1BQU0sT0FBTyxpQ0FBaUM7SUFDNUMsWUFDbUIsVUFBd0IsRUFDeEIsS0FBUztRQURULGVBQVUsR0FBVixVQUFVLENBQWM7UUFDeEIsVUFBSyxHQUFMLEtBQUssQ0FBSTtJQUN6QixDQUFDO0lBRUosUUFBUTtRQUNOLE1BQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsV0FBVztRQUNULE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDdkIsT0FBTyxJQUFJLGdCQUFnQixDQUN6QjtZQUNFO2dCQUNFLElBQUksRUFBRSxlQUFlO2dCQUNyQixFQUFFLEVBQUUsSUFBSSxDQUFDLFVBQVU7Z0JBQ25CLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDLGFBQWEsQ0FDNUMsc0JBQXNCLENBQ3ZCO2dCQUNELElBQUksRUFBRSxZQUFZLENBQUMsT0FBTztnQkFDMUIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7Z0JBQ2xCLFdBQVcsRUFBRSxFQUFFO2FBQ2hCO1NBQ0YsRUFDRCxFQUFFLEVBQ0YsRUFBRSxFQUNGLEVBQUUsRUFDRixJQUFJLENBQUMsVUFBVSxDQUNoQixDQUFDO0lBQ0osQ0FBQztJQUVELGNBQWM7UUFDWixPQUFPO0lBQ1QsQ0FBQztDQUNGIn0=
