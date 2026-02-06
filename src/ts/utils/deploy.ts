import { Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";

import { MeteredContract } from "../artifacts/index.js";

/**
 * Deploys the Metered FPC contract.
 * @param deployer The wallet to deploy with
 * @param owner The owner address of the contract
 * @param ecdsaPublicKeyX The ECDSA public key X coordinate (32 bytes)
 * @param ecdsaPublicKeyY The ECDSA public key Y coordinate (32 bytes)
 */
export async function deployMeteredContract(
  deployer: Wallet,
  owner: AztecAddress,
  ecdsaPublicKeyX: number[],
  ecdsaPublicKeyY: number[],
): Promise<MeteredContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return MeteredContract.deploy(
    deployer,
    owner,
    ecdsaPublicKeyX,
    ecdsaPublicKeyY,
  )
    .send({ from: deployerAddress })
    .deployed();
}
