import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * A fee payment method that calls `sponsor_metered()` on a FeePayment contract.
 * The contract is expected to:
 * - have enough protocol FeeJuice to actually pay the tx fee, AND
 * - have enough internal `fee_juice_balance` to reserve/subtract `max_gas_cost`.
 */
export class MeteredSponsoredFeePaymentMethod {
  constructor(paymentContract) {
    this.paymentContract = paymentContract;
  }
  getAsset() {
    throw new Error("Asset is not required for sponsored fpc.");
  }
  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }
  async getExecutionPayload() {
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
      this.paymentContract,
    );
  }
  getGasSettings() {
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
export class MeteredExactSponsoredFeePaymentMethod {
  constructor(paymentContract) {
    this.paymentContract = paymentContract;
  }
  getAsset() {
    throw new Error("Asset is not required for sponsored fpc.");
  }
  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }
  async getExecutionPayload() {
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
      this.paymentContract,
    );
  }
  getGasSettings() {
    return;
  }
}
/**
 * A fee payment method that calls `sponsor_metered_teardown_revert()` on a FeePayment contract.
 *
 * This is mainly useful in tests to force a `TEARDOWN_REVERTED` tx status without involving tokens.
 */
export class TeardownRevertMeteredSponsoredFeePaymentMethod {
  constructor(paymentContract) {
    this.paymentContract = paymentContract;
  }
  getAsset() {
    throw new Error("Asset is not required for sponsored fpc.");
  }
  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }
  async getExecutionPayload() {
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
      this.paymentContract,
    );
  }
  getGasSettings() {
    return;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2ZlZS1wYXltZW50LW1ldGhvZHMvbWV0ZXJlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFHbkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFcEQ7Ozs7O0dBS0c7QUFDSCxNQUFNLE9BQU8sZ0NBQWdDO0lBQzNDLFlBQW9CLGVBQTZCO1FBQTdCLG9CQUFlLEdBQWYsZUFBZSxDQUFjO0lBQUcsQ0FBQztJQUVyRCxRQUFRO1FBQ04sTUFBTSxJQUFJLEtBQUssQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFRCxXQUFXO1FBQ1QsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQjtRQUN2QixPQUFPLElBQUksZ0JBQWdCLENBQ3pCO1lBQ0U7Z0JBQ0UsSUFBSSxFQUFFLGlCQUFpQjtnQkFDdkIsRUFBRSxFQUFFLElBQUksQ0FBQyxlQUFlO2dCQUN4QixRQUFRLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUM7Z0JBQ25FLElBQUksRUFBRSxZQUFZLENBQUMsT0FBTztnQkFDMUIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLElBQUksRUFBRSxFQUFFO2dCQUNSLFdBQVcsRUFBRSxFQUFFO2FBQ2hCO1NBQ0YsRUFDRCxFQUFFLEVBQ0YsRUFBRSxFQUNGLEVBQUUsRUFDRixJQUFJLENBQUMsZUFBZSxDQUNyQixDQUFDO0lBQ0osQ0FBQztJQUVELGNBQWM7UUFDWixPQUFPO0lBQ1QsQ0FBQztDQUNGO0FBRUQ7Ozs7OztHQU1HO0FBQ0gsTUFBTSxPQUFPLHFDQUFxQztJQUNoRCxZQUFvQixlQUE2QjtRQUE3QixvQkFBZSxHQUFmLGVBQWUsQ0FBYztJQUFHLENBQUM7SUFFckQsUUFBUTtRQUNOLE1BQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsV0FBVztRQUNULE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDdkIsT0FBTyxJQUFJLGdCQUFnQixDQUN6QjtZQUNFO2dCQUNFLElBQUksRUFBRSx1QkFBdUI7Z0JBQzdCLEVBQUUsRUFBRSxJQUFJLENBQUMsZUFBZTtnQkFDeEIsUUFBUSxFQUFFLE1BQU0sZ0JBQWdCLENBQUMsYUFBYSxDQUM1Qyx5QkFBeUIsQ0FDMUI7Z0JBQ0QsSUFBSSxFQUFFLFlBQVksQ0FBQyxPQUFPO2dCQUMxQixhQUFhLEVBQUUsS0FBSztnQkFDcEIsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsV0FBVyxFQUFFLEVBQUU7YUFDaEI7U0FDRixFQUNELEVBQUUsRUFDRixFQUFFLEVBQ0YsRUFBRSxFQUNGLElBQUksQ0FBQyxlQUFlLENBQ3JCLENBQUM7SUFDSixDQUFDO0lBRUQsY0FBYztRQUNaLE9BQU87SUFDVCxDQUFDO0NBQ0Y7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxPQUFPLDhDQUE4QztJQUN6RCxZQUFvQixlQUE2QjtRQUE3QixvQkFBZSxHQUFmLGVBQWUsQ0FBYztJQUFHLENBQUM7SUFFckQsUUFBUTtRQUNOLE1BQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsV0FBVztRQUNULE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDdkIsT0FBTyxJQUFJLGdCQUFnQixDQUN6QjtZQUNFO2dCQUNFLElBQUksRUFBRSxpQ0FBaUM7Z0JBQ3ZDLEVBQUUsRUFBRSxJQUFJLENBQUMsZUFBZTtnQkFDeEIsUUFBUSxFQUFFLE1BQU0sZ0JBQWdCLENBQUMsYUFBYSxDQUM1QyxtQ0FBbUMsQ0FDcEM7Z0JBQ0QsSUFBSSxFQUFFLFlBQVksQ0FBQyxPQUFPO2dCQUMxQixhQUFhLEVBQUUsS0FBSztnQkFDcEIsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsV0FBVyxFQUFFLEVBQUU7YUFDaEI7U0FDRixFQUNELEVBQUUsRUFDRixFQUFFLEVBQ0YsRUFBRSxFQUNGLElBQUksQ0FBQyxlQUFlLENBQ3JCLENBQUM7SUFDSixDQUFDO0lBRUQsY0FBYztRQUNaLE9BQU87SUFDVCxDQUFDO0NBQ0YifQ==
