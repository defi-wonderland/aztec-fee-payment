import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * Fee payment method for the Metered contract.
 * The contract tracks internal balances and deducts max gas cost per transaction.
 * Users must have sufficient balance (via `mint()`) to cover estimated fees.
 * NOTE: Does not refund unused gas - use MeteredExactFeePaymentMethod for refunds.
 */
export class MeteredFeePaymentMethod {
  constructor(fpcAddress) {
    this.fpcAddress = fpcAddress;
  }
  getAsset() {
    throw new Error("Asset is not required for metered fee payment.");
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
          selector: await FunctionSelector.fromSignature("pay_fee()"),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          isPublicStatic: () => false,
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
  getGasSettings() {
    // TODO: Implement?
    return;
  }
}
/**
 * Fee payment method for the Metered contract with exact refunds.
 * Deducts max gas cost upfront, then refunds (max - actual) in teardown.
 */
export class MeteredExactFeePaymentMethod {
  constructor(fpcAddress) {
    this.fpcAddress = fpcAddress;
  }
  getAsset() {
    throw new Error("Asset is not required for metered fee payment.");
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
          selector: await FunctionSelector.fromSignature("pay_fee_exact()"),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          isPublicStatic: () => false,
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
  getGasSettings() {
    // TODO: Implement?
    return;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2ZlZS1wYXltZW50LW1ldGhvZHMvbWV0ZXJlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFHbkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFcEQ7Ozs7O0dBS0c7QUFDSCxNQUFNLE9BQU8sdUJBQXVCO0lBQ2xDLFlBQTZCLFVBQXdCO1FBQXhCLGVBQVUsR0FBVixVQUFVLENBQWM7SUFBRyxDQUFDO0lBRXpELFFBQVE7UUFDTixNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUVELFdBQVc7UUFDVCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CO1FBQ3ZCLE9BQU8sSUFBSSxnQkFBZ0IsQ0FDekI7WUFDRTtnQkFDRSxJQUFJLEVBQUUsU0FBUztnQkFDZixFQUFFLEVBQUUsSUFBSSxDQUFDLFVBQVU7Z0JBQ25CLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUM7Z0JBQzNELElBQUksRUFBRSxZQUFZLENBQUMsT0FBTztnQkFDMUIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLGNBQWMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLO2dCQUMzQixJQUFJLEVBQUUsRUFBRTtnQkFDUixXQUFXLEVBQUUsRUFBRTthQUNoQjtTQUNGLEVBQ0QsRUFBRSxFQUNGLEVBQUUsRUFDRixFQUFFLEVBQ0YsSUFBSSxDQUFDLFVBQVUsQ0FDaEIsQ0FBQztJQUNKLENBQUM7SUFFRCxjQUFjO1FBQ1osbUJBQW1CO1FBQ25CLE9BQU87SUFDVCxDQUFDO0NBQ0Y7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sNEJBQTRCO0lBQ3ZDLFlBQTZCLFVBQXdCO1FBQXhCLGVBQVUsR0FBVixVQUFVLENBQWM7SUFBRyxDQUFDO0lBRXpELFFBQVE7UUFDTixNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUVELFdBQVc7UUFDVCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CO1FBQ3ZCLE9BQU8sSUFBSSxnQkFBZ0IsQ0FDekI7WUFDRTtnQkFDRSxJQUFJLEVBQUUsZUFBZTtnQkFDckIsRUFBRSxFQUFFLElBQUksQ0FBQyxVQUFVO2dCQUNuQixRQUFRLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUM7Z0JBQ2pFLElBQUksRUFBRSxZQUFZLENBQUMsT0FBTztnQkFDMUIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLGNBQWMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLO2dCQUMzQixJQUFJLEVBQUUsRUFBRTtnQkFDUixXQUFXLEVBQUUsRUFBRTthQUNoQjtTQUNGLEVBQ0QsRUFBRSxFQUNGLEVBQUUsRUFDRixFQUFFLEVBQ0YsSUFBSSxDQUFDLFVBQVUsQ0FDaEIsQ0FBQztJQUNKLENBQUM7SUFFRCxjQUFjO1FBQ1osbUJBQW1CO1FBQ25CLE9BQU87SUFDVCxDQUFDO0NBQ0YifQ==
