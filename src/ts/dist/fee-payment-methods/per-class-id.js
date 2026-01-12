import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { ExecutionPayload } from "@aztec/stdlib/tx";
/**
 * Fee payment method for the PerClassId contract.
 * The contract only sponsors transactions from accounts of a specific contract class.
 * The allowed class ID is set at deployment time (immutable).
 */
export class PerClassIdFeePaymentMethod {
  constructor(fpcAddress) {
    this.fpcAddress = fpcAddress;
  }
  getAsset() {
    throw new Error("Asset is not required for per-class-id fee payment.");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyLWNsYXNzLWlkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vZmVlLXBheW1lbnQtbWV0aG9kcy9wZXItY2xhc3MtaWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBR25FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRXBEOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sMEJBQTBCO0lBQ3JDLFlBQTZCLFVBQXdCO1FBQXhCLGVBQVUsR0FBVixVQUFVLENBQWM7SUFBRyxDQUFDO0lBRXpELFFBQVE7UUFDTixNQUFNLElBQUksS0FBSyxDQUFDLHFEQUFxRCxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVELFdBQVc7UUFDVCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CO1FBQ3ZCLE9BQU8sSUFBSSxnQkFBZ0IsQ0FDekI7WUFDRTtnQkFDRSxJQUFJLEVBQUUsU0FBUztnQkFDZixFQUFFLEVBQUUsSUFBSSxDQUFDLFVBQVU7Z0JBQ25CLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUM7Z0JBQzNELElBQUksRUFBRSxZQUFZLENBQUMsT0FBTztnQkFDMUIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLElBQUksRUFBRSxFQUFFO2dCQUNSLFdBQVcsRUFBRSxFQUFFO2FBQ2hCO1NBQ0YsRUFDRCxFQUFFLEVBQ0YsRUFBRSxFQUNGLEVBQUUsRUFDRixJQUFJLENBQUMsVUFBVSxDQUNoQixDQUFDO0lBQ0osQ0FBQztJQUVELGNBQWM7UUFDWixPQUFPO0lBQ1QsQ0FBQztDQUNGIn0=
