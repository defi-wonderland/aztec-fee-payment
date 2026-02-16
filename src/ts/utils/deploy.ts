import { Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/stdlib/aztec-address";

import { MeteredContract } from "../artifacts/index.js";

/**
 * Deploys the Metered FPC contract with an owner (Service Provider) address.
 * The owner's account contract is used to verify authwits for minting.
 * If no owner is specified, the deployer's address is used.
 */
export async function deployMeteredContract(
  deployer: Wallet,
  owner?: AztecAddress,
): Promise<MeteredContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  const ownerAddress = owner ?? deployerAddress;
  return MeteredContract.deploy(deployer, ownerAddress)
    .send({ from: deployerAddress })
    .deployed();
}
