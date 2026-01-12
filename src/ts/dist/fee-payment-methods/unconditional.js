import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * Fee payment method for the Unconditional contract.
 * The contract sponsors all transactions without conditions.
 */
export class UnconditionalFeePaymentMethod {
  constructor(fpcAddress) {
    this.fpcAddress = fpcAddress;
  }
  getAsset() {
    throw new Error("Asset is not required for unconditional fee payment.");
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
    return;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5jb25kaXRpb25hbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2ZlZS1wYXltZW50LW1ldGhvZHMvdW5jb25kaXRpb25hbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFHbkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFcEQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLDZCQUE2QjtJQUN4QyxZQUE2QixVQUF3QjtRQUF4QixlQUFVLEdBQVYsVUFBVSxDQUFjO0lBQUcsQ0FBQztJQUV6RCxRQUFRO1FBQ04sTUFBTSxJQUFJLEtBQUssQ0FBQyxzREFBc0QsQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFFRCxXQUFXO1FBQ1QsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQjtRQUN2QixPQUFPLElBQUksZ0JBQWdCLENBQ3pCO1lBQ0U7Z0JBQ0UsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsRUFBRSxFQUFFLElBQUksQ0FBQyxVQUFVO2dCQUNuQixRQUFRLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDO2dCQUMzRCxJQUFJLEVBQUUsWUFBWSxDQUFDLE9BQU87Z0JBQzFCLGFBQWEsRUFBRSxLQUFLO2dCQUNwQixRQUFRLEVBQUUsS0FBSztnQkFDZixJQUFJLEVBQUUsRUFBRTtnQkFDUixXQUFXLEVBQUUsRUFBRTthQUNoQjtTQUNGLEVBQ0QsRUFBRSxFQUNGLEVBQUUsRUFDRixFQUFFLEVBQ0YsSUFBSSxDQUFDLFVBQVUsQ0FDaEIsQ0FBQztJQUNKLENBQUM7SUFFRCxjQUFjO1FBQ1osT0FBTztJQUNULENBQUM7Q0FDRiJ9
