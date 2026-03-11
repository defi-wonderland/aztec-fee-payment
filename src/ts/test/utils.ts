import { Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { AztecNode } from "@aztec/aztec.js/node";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";

import { CounterContract } from "../../artifacts/Counter.js";
import {
  REASONABLE_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
} from "../utils/gas.js";

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

/** Common gas setup interface. teardownGasLimits is for transaction configuration only — it is NOT included in maxGasCost. */
export interface GasSetup {
  maxFeesPerGas: GasFees;
  maxPriorityFeesPerGas: GasFees;
  gasLimits: Gas;
  /** Zero by default. Override with REASONABLE_TEARDOWN_GAS_LIMITS for transactions with a teardown phase (e.g. pay_fee_exact). */
  teardownGasLimits: Gas;
  maxGasCost: bigint;
}

/** Deploys the Counter contract. */
export async function deployCounter(
  deployer: Wallet,
): Promise<CounterContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  const { contract } = await CounterContract.deploy(deployer).send({
    from: deployerAddress,
  });
  return contract;
}

/**
 * Forces an L2 block to be produced by submitting a transaction.
 * Use after L1 time warps to ensure the new timestamp is reflected
 * in the L2 historical state (e.g. for DelayedPublicMutable settlement).
 */
export async function produceL2Block(wallet: Wallet): Promise<void> {
  await deployCounter(wallet);
}

/**
 * Get common gas setup for fee payment tests.
 *
 * teardownGasLimits is always zero here. For pay_fee_exact transactions that
 * execute a teardown phase, override it with REASONABLE_TEARDOWN_GAS_LIMITS.
 *
 * maxGasCost only accounts for gasLimits — teardown gas is already included
 * in the protocol-level gas budget and must not be double-counted.
 */
export async function getGasSetup(aztecNode: AztecNode): Promise<GasSetup> {
  const baseFees = (await aztecNode.getCurrentMinFees()) as BaseFees;
  const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);
  const gasLimits: Gas = REASONABLE_GAS_LIMITS;
  const teardownGasLimits: Gas = Gas.from({ l2Gas: 0, daGas: 0 });
  const maxPriorityFeesPerGas: GasFees = MAX_PRIORITY_FEE_PER_GAS;
  const maxGasCost = maxGasCostFor(maxFeesPerGas, gasLimits);

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
