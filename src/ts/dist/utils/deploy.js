import {
  UnconditionalContract,
  PerClassIdContract,
  MeteredContract,
  MeteredTokenContract,
} from "../artifacts/index.js";
/**
 * Deploys the Unconditional FPC contract.
 */
export async function deployUnconditionalContract(deployer) {
  const deployerAddress = (await deployer.getAccounts())[0].item;
  return UnconditionalContract.deploy(deployer)
    .send({ from: deployerAddress })
    .deployed();
}
/**
 * Deploys the PerClassId FPC contract.
 * @param allowedClassId - The contract class ID that is allowed to use this FPC
 */
export async function deployPerClassIdContract(deployer, allowedClassId) {
  const deployerAddress = (await deployer.getAccounts())[0].item;
  return PerClassIdContract.deploy(deployer, allowedClassId)
    .send({ from: deployerAddress })
    .deployed();
}
/**
 * Deploys the Metered FPC contract.
 */
export async function deployMeteredContract(deployer) {
  const deployerAddress = (await deployer.getAccounts())[0].item;
  return MeteredContract.deploy(deployer)
    .send({ from: deployerAddress })
    .deployed();
}
/**
 * Deploys the MeteredToken FPC contract.
 * @param tokenAddress - The token address that will be accepted for payment
 */
export async function deployMeteredTokenContract(deployer, tokenAddress) {
  const deployerAddress = (await deployer.getAccounts())[0].item;
  return MeteredTokenContract.deploy(deployer, tokenAddress)
    .send({ from: deployerAddress })
    .deployed();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwbG95LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vdXRpbHMvZGVwbG95LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUlBLE9BQU8sRUFDTCxxQkFBcUIsRUFDckIsa0JBQWtCLEVBQ2xCLGVBQWUsRUFDZixvQkFBb0IsR0FDckIsTUFBTSx1QkFBdUIsQ0FBQztBQUUvQjs7R0FFRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsMkJBQTJCLENBQy9DLFFBQWdCO0lBRWhCLE1BQU0sZUFBZSxHQUFHLENBQUMsTUFBTSxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxJQUFJLENBQUM7SUFDaEUsT0FBTyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1NBQzFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsQ0FBQztTQUMvQixRQUFRLEVBQUUsQ0FBQztBQUNoQixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSx3QkFBd0IsQ0FDNUMsUUFBZ0IsRUFDaEIsY0FBa0I7SUFFbEIsTUFBTSxlQUFlLEdBQUcsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLElBQUksQ0FBQztJQUNoRSxPQUFPLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsY0FBYyxDQUFDO1NBQ3ZELElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsQ0FBQztTQUMvQixRQUFRLEVBQUUsQ0FBQztBQUNoQixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHFCQUFxQixDQUN6QyxRQUFnQjtJQUVoQixNQUFNLGVBQWUsR0FBRyxDQUFDLE1BQU0sUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDO0lBQ2hFLE9BQU8sZUFBZSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7U0FDcEMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxDQUFDO1NBQy9CLFFBQVEsRUFBRSxDQUFDO0FBQ2hCLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLDBCQUEwQixDQUM5QyxRQUFnQixFQUNoQixZQUEwQjtJQUUxQixNQUFNLGVBQWUsR0FBRyxDQUFDLE1BQU0sUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsSUFBSSxDQUFDO0lBQ2hFLE9BQU8sb0JBQW9CLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUM7U0FDdkQsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxDQUFDO1NBQy9CLFFBQVEsRUFBRSxDQUFDO0FBQ2hCLENBQUMifQ==
