import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * A fee payment method that uses a contract that blindly sponsors transactions.
 * This contract is expected to be prefunded in testing environments.
 */
export class SponsoredFeePaymentMethod {
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
      this.paymentContract,
    );
  }
  getGasSettings() {
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
export class ClassIdValidatedSponsoredFeePaymentMethod {
  constructor(paymentContract, expectedClassId) {
    this.paymentContract = paymentContract;
    this.expectedClassId = expectedClassId;
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
      this.paymentContract,
    );
  }
  getGasSettings() {
    return;
  }
}
/**
 * A fee payment method that calls `sponsor_unconditionally_teardown_revert()` on a FeePayment contract.
 *
 * This is mainly useful in tests to force a `TEARDOWN_REVERTED` tx status without involving tokens.
 */
export class TeardownRevertSponsoredFeePaymentMethod {
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
      this.paymentContract,
    );
  }
  getGasSettings() {
    return;
  }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BvbnNvcmVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vZmVlLXBheW1lbnQtbWV0aG9kcy9zcG9uc29yZWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBR25FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBR3BEOzs7R0FHRztBQUNILE1BQU0sT0FBTyx5QkFBeUI7SUFDcEMsWUFBb0IsZUFBNkI7UUFBN0Isb0JBQWUsR0FBZixlQUFlLENBQWM7SUFBRyxDQUFDO0lBRXJELFFBQVE7UUFDTixNQUFNLElBQUksS0FBSyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVELFdBQVc7UUFDVCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CO1FBQ3ZCLE9BQU8sSUFBSSxnQkFBZ0IsQ0FDekI7WUFDRTtnQkFDRSxJQUFJLEVBQUUseUJBQXlCO2dCQUMvQixFQUFFLEVBQUUsSUFBSSxDQUFDLGVBQWU7Z0JBQ3hCLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDLGFBQWEsQ0FDNUMsMkJBQTJCLENBQzVCO2dCQUNELElBQUksRUFBRSxZQUFZLENBQUMsT0FBTztnQkFDMUIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLElBQUksRUFBRSxFQUFFO2dCQUNSLFdBQVcsRUFBRSxFQUFFO2FBQ2hCO1NBQ0YsRUFDRCxFQUFFLEVBQ0YsRUFBRSxFQUNGLEVBQUUsRUFDRixJQUFJLENBQUMsZUFBZSxDQUNyQixDQUFDO0lBQ0osQ0FBQztJQUVELGNBQWM7UUFDWixPQUFPO0lBQ1QsQ0FBQztDQUNGO0FBRUQ7Ozs7Ozs7Ozs7OztHQVlHO0FBQ0gsTUFBTSxPQUFPLHlDQUF5QztJQUNwRCxZQUNtQixlQUE2QixFQUM3QixlQUFtQjtRQURuQixvQkFBZSxHQUFmLGVBQWUsQ0FBYztRQUM3QixvQkFBZSxHQUFmLGVBQWUsQ0FBSTtJQUNuQyxDQUFDO0lBRUosUUFBUTtRQUNOLE1BQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsV0FBVztRQUNULE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDdkIsT0FBTyxJQUFJLGdCQUFnQixDQUN6QjtZQUNFO2dCQUNFLElBQUksRUFBRSxzQkFBc0I7Z0JBQzVCLEVBQUUsRUFBRSxJQUFJLENBQUMsZUFBZTtnQkFDeEIsUUFBUSxFQUFFLE1BQU0sZ0JBQWdCLENBQUMsYUFBYSxDQUM1QywrQkFBK0IsQ0FDaEM7Z0JBQ0QsSUFBSSxFQUFFLFlBQVksQ0FBQyxPQUFPO2dCQUMxQixhQUFhLEVBQUUsS0FBSztnQkFDcEIsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQztnQkFDNUIsV0FBVyxFQUFFLEVBQUU7YUFDaEI7U0FDRixFQUNELEVBQUUsRUFDRixFQUFFLEVBQ0YsRUFBRSxFQUNGLElBQUksQ0FBQyxlQUFlLENBQ3JCLENBQUM7SUFDSixDQUFDO0lBRUQsY0FBYztRQUNaLE9BQU87SUFDVCxDQUFDO0NBQ0Y7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxPQUFPLHVDQUF1QztJQUNsRCxZQUFvQixlQUE2QjtRQUE3QixvQkFBZSxHQUFmLGVBQWUsQ0FBYztJQUFHLENBQUM7SUFFckQsUUFBUTtRQUNOLE1BQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsV0FBVztRQUNULE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDdkIsT0FBTyxJQUFJLGdCQUFnQixDQUN6QjtZQUNFO2dCQUNFLElBQUksRUFBRSx5Q0FBeUM7Z0JBQy9DLEVBQUUsRUFBRSxJQUFJLENBQUMsZUFBZTtnQkFDeEIsUUFBUSxFQUFFLE1BQU0sZ0JBQWdCLENBQUMsYUFBYSxDQUM1QywyQ0FBMkMsQ0FDNUM7Z0JBQ0QsSUFBSSxFQUFFLFlBQVksQ0FBQyxPQUFPO2dCQUMxQixhQUFhLEVBQUUsS0FBSztnQkFDcEIsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsV0FBVyxFQUFFLEVBQUU7YUFDaEI7U0FDRixFQUNELEVBQUUsRUFDRixFQUFFLEVBQ0YsRUFBRSxFQUNGLElBQUksQ0FBQyxlQUFlLENBQ3JCLENBQUM7SUFDSixDQUFDO0lBRUQsY0FBYztRQUNaLE9BQU87SUFDVCxDQUFDO0NBQ0YifQ==
