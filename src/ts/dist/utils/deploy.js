import { FeePaymentContract } from "../artifacts/FeePayment.js";
/**
 * Deploys the FeePaymentContract contract.
 * @param deployer - The wallet to deploy the contract with.
 * @returns A deployed contract instance.
 */
export async function deployFeePaymentContract(deployer) {
  const deployerAddress = (await deployer.getAccounts())[0].item;
  return FeePaymentContract.deploy(deployer)
    .send({ from: deployerAddress })
    .deployed();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwbG95LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdXRpbHMvZGVwbG95LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRWhFOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHdCQUF3QixDQUM1QyxRQUFnQjtJQUVoQixNQUFNLGVBQWUsR0FBRyxDQUFDLE1BQU0sUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDO0lBQ2hFLE9BQU8sa0JBQWtCLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztTQUN2QyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFFLENBQUM7U0FDL0IsUUFBUSxFQUFFLENBQUM7QUFDaEIsQ0FBQyJ9
