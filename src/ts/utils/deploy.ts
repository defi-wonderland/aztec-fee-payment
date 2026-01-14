import { Wallet } from "@aztec/aztec.js/wallet";

import { MeteredContract } from "../artifacts/index.js";

/**
 * Deploys the Metered FPC contract.
 */
export async function deployMeteredContract(
  deployer: Wallet,
): Promise<MeteredContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return MeteredContract.deploy(deployer)
    .send({ from: deployerAddress })
    .deployed();
}
