import { Wallet } from "@aztec/aztec.js/wallet";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";

import {
  UnconditionalContract,
  PerClassIdContract,
  MeteredContract,
  MeteredTokenContract,
} from "../artifacts/index.js";

/**
 * Deploys the Unconditional FPC contract.
 */
export async function deployUnconditionalContract(
  deployer: Wallet,
): Promise<UnconditionalContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return UnconditionalContract.deploy(deployer)
    .send({ from: deployerAddress })
    .deployed();
}

/**
 * Deploys the PerClassId FPC contract.
 * @param allowedClassId - The contract class ID that is allowed to use this FPC
 */
export async function deployPerClassIdContract(
  deployer: Wallet,
  allowedClassId: Fr,
): Promise<PerClassIdContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return PerClassIdContract.deploy(deployer, allowedClassId)
    .send({ from: deployerAddress })
    .deployed();
}

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

/**
 * Deploys the MeteredToken FPC contract.
 * @param tokenAddress - The token address that will be accepted for payment
 */
export async function deployMeteredTokenContract(
  deployer: Wallet,
  tokenAddress: AztecAddress,
): Promise<MeteredTokenContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return MeteredTokenContract.deploy(deployer, tokenAddress)
    .send({ from: deployerAddress })
    .deployed();
}
