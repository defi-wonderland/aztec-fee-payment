import { Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";

import { MeteredContract } from "../artifacts/index.js";

/**
 * Deploys the Metered FPC contract.
 * @param deployer The wallet used to deploy the contract
 * @param owner The address of the account contract that authorizes mints
 */
export async function deployMeteredContract(
  deployer: Wallet,
  owner: AztecAddress,
): Promise<MeteredContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return MeteredContract.deploy(deployer, owner)
    .send({ from: deployerAddress })
    .deployed();
}
