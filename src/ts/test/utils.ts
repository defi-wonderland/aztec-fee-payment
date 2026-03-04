import { Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { AztecNode } from "@aztec/aztec.js/node";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";

import { CounterContract } from "../../artifacts/Counter.js";
import { MeteredFPCContract } from "../../artifacts/MeteredFPC.js";
import {
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
} from "../utils/gas.js";
import { deployMeteredFPCContract } from "../utils/deploy.js";
import { warpL1Time } from "./harness.js";

/** Global test timeout constant for individual test cases. */
export const TEST_TIMEOUT = 300_000;

/** Global constant for max priority fee per gas */
export const MAX_PRIORITY_FEE_PER_GAS = GasFees.from({
  feePerDaGas: 1000000000000000000n,
  feePerL2Gas: 1000000000000000000n,
});

/** Base fees interface for gas calculations */
export interface BaseFees {
  feePerDaGas: string | number | bigint;
  feePerL2Gas: string | number | bigint;
}

/** Common gas setup interface */
export interface GasSetup {
  maxFeesPerGas: GasFees;
  maxPriorityFeesPerGas: GasFees;
  gasLimits: Gas;
  teardownGasLimits: Gas;
  maxGasCost: bigint;
}

/** Deploys the Counter contract. */
export async function deployCounter(
  deployer: Wallet,
): Promise<CounterContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return CounterContract.deploy(deployer).send({ from: deployerAddress });
}

/**
 * Forces an L2 block to be produced by submitting a transaction.
 * Use after L1 time warps to ensure the new timestamp is reflected
 * in the L2 historical state (e.g. for DelayedPublicMutable settlement).
 */
export async function produceL2Block(wallet: Wallet): Promise<void> {
  await deployCounter(wallet);
}

/** Get common gas setup for fee payment tests (no teardown). */
export async function getGasSetup(aztecNode: AztecNode): Promise<GasSetup> {
  const baseFees = (await aztecNode.getCurrentMinFees()) as BaseFees;
  const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);
  const gasLimits: Gas = REASONABLE_GAS_LIMITS;
  const teardownGasLimits: Gas = Gas.from({ l2Gas: 0, daGas: 0 });
  const maxPriorityFeesPerGas: GasFees = MAX_PRIORITY_FEE_PER_GAS;
  const maxGasCost = maxGasCostFor(maxFeesPerGas, gasLimits, teardownGasLimits);

  return {
    maxFeesPerGas,
    maxPriorityFeesPerGas,
    gasLimits,
    teardownGasLimits,
    maxGasCost,
  };
}

/** Get gas setup for fee payment tests WITH teardown (for exact refund variants). */
export async function getGasSetupWithTeardown(
  aztecNode: AztecNode,
): Promise<GasSetup> {
  const baseFees = (await aztecNode.getCurrentMinFees()) as BaseFees;
  const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);
  const gasLimits: Gas = REASONABLE_GAS_LIMITS;
  const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;
  const maxPriorityFeesPerGas: GasFees = MAX_PRIORITY_FEE_PER_GAS;
  const maxGasCost = maxGasCostFor(maxFeesPerGas, gasLimits, teardownGasLimits);

  return {
    maxFeesPerGas,
    maxPriorityFeesPerGas,
    gasLimits,
    teardownGasLimits,
    maxGasCost,
  };
}

/** Get FeeJuice balance of an address. */
export async function getBalance(
  address: AztecAddress,
  aztecNode: AztecNode,
): Promise<bigint> {
  return getFeeJuiceBalance(address, aztecNode);
}

const CONFIG_DELAY = 600;

/**
 * Deploys the Metered FPC and warps L1 time so the DelayedPublicMutable
 * owner is settled and readable in private context.
 */
export async function deploySettledMetered(
  wallet: Wallet,
  owner: AztecAddress,
  aztecNode: AztecNode,
): Promise<MeteredFPCContract> {
  const fpc = await deployMeteredFPCContract(wallet, owner);
  await warpL1Time(aztecNode, CONFIG_DELAY);
  await produceL2Block(wallet);
  return fpc;
}

/**
 * Deploys the Metered FPC without warping time. The owner is scheduled
 * but not yet effective -- useful for testing incomplete initialization.
 */
export async function deployUnsettledMetered(
  wallet: Wallet,
  owner: AztecAddress,
): Promise<MeteredFPCContract> {
  return deployMeteredFPCContract(wallet, owner);
}
