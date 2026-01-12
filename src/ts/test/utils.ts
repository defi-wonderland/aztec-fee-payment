import { Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { AztecNode } from "@aztec/aztec.js/node";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import type { ContractBase } from "@aztec/aztec.js/contracts";

import { CounterContract } from "../artifacts/Counter.js";
import {
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
} from "../utils/gas.js";

/**
 * Global test timeout constant for individual test cases.
 */
export const TEST_TIMEOUT = 300_000;

/** Global constant for max priority fee per gas */
export const MAX_PRIORITY_FEE_PER_GAS = GasFees.from({
  feePerDaGas: 1000000000000000000n,
  feePerL2Gas: 1000000000000000000n,
});

/**
 * Base fees interface for gas calculations
 */
export interface BaseFees {
  feePerDaGas: string | number | bigint;
  feePerL2Gas: string | number | bigint;
}

/**
 * Common gas setup interface
 */
export interface GasSetup {
  maxFeesPerGas: GasFees;
  maxPriorityFeesPerGas: GasFees;
  gasLimits: Gas;
  teardownGasLimits: Gas;
  maxGasCost: bigint;
}

/**
 * Common balance interface for fee payment testing
 */
export interface FeePaymentBalances {
  sponsorFeeJuice: bigint;
  fpcPublic: bigint;
  alicePrivate: bigint;
}

/**
 * Common balance interface for fee juice testing
 */
export interface FeeJuiceBalances {
  sponsorFeeJuice: bigint;
  internalBalance: bigint;
}

/**
 * Deploys the Counter contract.
 */
export async function deployCounter(
  deployer: Wallet,
): Promise<CounterContract> {
  const deployerAddress = (await deployer.getAccounts())[0]!.item;
  return CounterContract.deploy(deployer)
    .send({ from: deployerAddress })
    .deployed();
}

/**
 * Get common gas setup for fee payment tests
 */
export async function getGasSetup(aztecNode: AztecNode): Promise<GasSetup> {
  const baseFees = (await aztecNode.getCurrentBaseFees()) as BaseFees;
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

/**
 * Get common gas setup for fee payment tests without teardown
 */
export async function getGasSetupNoTeardown(
  aztecNode: AztecNode,
): Promise<GasSetup> {
  const baseFees = (await aztecNode.getCurrentBaseFees()) as BaseFees;
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

/**
 * Get balances for fee payment with external tokens testing
 */
export async function getFeePaymentBalances(
  feePaymentContract: ContractBase,
  token: TokenContract,
  alice: AztecAddress,
  aztecNode: AztecNode,
): Promise<FeePaymentBalances> {
  const sponsorFeeJuice = await getFeeJuiceBalance(
    feePaymentContract.address,
    aztecNode,
  );
  const fpcPublic = await token.methods
    .balance_of_public(feePaymentContract.address)
    .simulate({ from: alice });
  const alicePrivate = await token.methods
    .balance_of_private(alice)
    .simulate({ from: alice });

  return { sponsorFeeJuice, fpcPublic, alicePrivate };
}

/**
 * Get balances for fee juice testing
 */
export async function getFeeJuiceBalances(
  feePaymentContract: ContractBase,
  alice: AztecAddress,
  aztecNode: AztecNode,
): Promise<FeeJuiceBalances> {
  const sponsorFeeJuice = await getFeeJuiceBalance(
    feePaymentContract.address,
    aztecNode,
  );
  const internalBalance = await feePaymentContract.methods
    .get_fee_juice_balance(alice)
    .simulate({ from: alice });

  return { sponsorFeeJuice, internalBalance };
}

/**
 * Sync token private state
 */
export async function syncTokenState(
  token: TokenContract,
  alice: AztecAddress,
): Promise<void> {
  await token.methods.sync_private_state().simulate({ from: alice });
}

/**
 * Mint fee juice for testing
 */
export async function mintFeeJuice(
  feePaymentContract: ContractBase,
  alice: AztecAddress,
  amount: bigint,
): Promise<void> {
  await feePaymentContract.methods
    .mint_fee_juice(alice, amount)
    .send({ from: alice })
    .wait();
}
