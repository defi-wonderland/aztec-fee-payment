import { Wallet } from "@aztec/aztec.js/wallet";

import { FeePaymentContract } from "../artifacts/FeePayment.js";

/**
 * Deploys the FeePaymentContract contract.
 * @param deployer - The wallet to deploy the contract with.
 * @returns A deployed contract instance.
 */
export async function deployFeePaymentContract(
  deployer: Wallet,
): Promise<FeePaymentContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return FeePaymentContract.deploy(deployer)
    .send({ from: deployerAddress })
    .deployed();
}
