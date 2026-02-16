import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TxStatus } from "@aztec/aztec.js/tx";
import { Fr } from "@aztec/foundation/curves/bn254";
import { computeInnerAuthWitHash } from "@aztec/stdlib/auth-witness";

import { CounterContract, MeteredContract } from "../artifacts/index.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintFeePaymentMethod,
} from "../fee-payment-methods/index.js";
import { deployMeteredContract } from "../utils/deploy.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
} from "./harness.js";

import {
  TEST_TIMEOUT,
  deployCounter,
  getGasSetup,
  getGasSetupWithTeardown,
  getBalance,
} from "./utils.js";

/**
 * Creates a mint authwit and stores it in the wallet's PXE.
 * The wallet (owner) signs the custom inner hash H(amount, secret).
 * Returns the secret used, so the caller can pass it to mint().
 */
async function mintWithAuthwit(
  wallet: TestWallet,
  fpc: MeteredContract,
  sender: AztecAddress,
  amount: bigint,
  aztecNode: AztecNode,
): Promise<void> {
  const secret = Fr.random();

  // Compute custom inner hash: H(amount, secret) — matches Noir's compute_inner_authwit_hash
  const innerHash = await computeInnerAuthWitHash([new Fr(amount), secret]);

  // Create the authwit signed by the wallet's account (the owner/SP).
  // The wallet computes the outer hash using the correct chain_id and version.
  const authWit = await wallet.createAuthWit({
    consumer: fpc.address,
    innerHash,
  });

  // Store the witness in the PXE so it's available during private execution
  await wallet.addAuthWitness(authWit);

  // Use MeteredMintFeePaymentMethod to call mint() in the setup phase.
  // The FPC self-sponsors the transaction — sender needs no FJ balance.
  const { maxFeesPerGas, gasLimits, teardownGasLimits } =
    await getGasSetup(aztecNode);

  const mintPaymentMethod = new MeteredMintFeePaymentMethod(
    fpc.address,
    amount,
    secret,
  );

  // Send a no-op transaction with mint as the fee payment method.
  // The mint function handles everything: authwit validation, fee payment, and balance minting.
  await fpc.methods
    .balance_of(sender)
    .send({
      from: sender,
      fee: {
        paymentMethod: mintPaymentMethod,
        gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
      },
    })
    .wait();
}

describe("Metered Fee Payment Contract", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let fpc: MeteredContract;
  let paymentMethod: MeteredFeePaymentMethod;
  let exactPaymentMethod: MeteredExactFeePaymentMethod;

  const MINT_AMOUNT = 100_000_000_000_000_000_000n;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-metered", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    // Deploy counter for testing
    counter = await deployCounter(wallet);

    // Deploy and fund the Metered FPC (deployer/alice is the owner)
    fpc = await deployMeteredContract(wallet);
    const { balance } = await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      fpc.address,
      {
        claimTxSender: alice,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "test:metered",
      },
    );
    expect(balance).toBeGreaterThan(0n);

    paymentMethod = new MeteredFeePaymentMethod(fpc.address);
    exactPaymentMethod = new MeteredExactFeePaymentMethod(fpc.address);
  });

  beforeEach(async () => {
    // Mint internal balance for alice using Phase 2 authwit flow.
    // The wallet (alice/deployer) is the owner and signs the authwit.
    await mintWithAuthwit(wallet, fpc, alice, MINT_AMOUNT, aztecNode);
  });

  // --- pay_fee (no refund) tests ---

  it(
    "pay_fee SUCCESS: sponsors transaction when user has balance",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const internalBalanceBefore = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetup(aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: {
            paymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      // FPC paid the actual transaction fee
      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);
      // User's internal balance was debited max gas cost (no refund)
      expect(internalBalanceAfter).toBe(internalBalanceBefore - maxGasCost);
    },
    TEST_TIMEOUT,
  );

  // --- pay_fee_exact (with refund) tests ---

  it(
    "pay_fee_exact SUCCESS: sponsors transaction and refunds unused gas",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const internalBalanceBefore = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetupWithTeardown(aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: {
            paymentMethod: exactPaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });
      const transactionFee = receipt.transactionFee!;

      // FPC paid the actual transaction fee (includes teardown costs)
      expect(fpcBalanceAfter).toBe(fpcBalanceBefore - transactionFee);

      // User's internal balance was debited maxGasCost upfront, then refunded the difference in teardown
      const expectedBalance = internalBalanceBefore - BigInt(transactionFee);
      expect(internalBalanceAfter).toBe(expectedBalance);
    },
    TEST_TIMEOUT,
  );

  // --- Additional tests ---

  it(
    "pay_fee INVALID: fails when user has insufficient balance (tx not included)",
    async () => {
      const freshCounter = await deployCounter(wallet);
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      // Create a fresh FPC without minting internal balance
      const freshFpc = await deployMeteredContract(wallet);
      await fundL2AddressWithFeeJuiceFromL1(
        aztecNode,
        wallet,
        freshFpc.address,
        {
          claimTxSender: alice,
          produceL2Block: async () => {
            await deployCounter(wallet);
          },
          loggerName: "test:metered-fresh",
        },
      );

      const freshPaymentMethod = new MeteredFeePaymentMethod(freshFpc.address);

      // Should fail because alice has no internal balance
      await expect(
        freshCounter.methods
          .increment()
          .send({
            from: alice,
            fee: {
              paymentMethod: freshPaymentMethod,
              gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
            },
          })
          .wait(),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );
});
