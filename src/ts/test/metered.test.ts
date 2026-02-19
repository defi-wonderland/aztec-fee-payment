import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TxStatus } from "@aztec/aztec.js/tx";
import { Fr } from "@aztec/aztec.js/fields";
import { computeInnerAuthWitHash } from "@aztec/stdlib/auth-witness";

import { CounterContract } from "../../artifacts/Counter.js";
import { MeteredContract } from "../../artifacts/Metered.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
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

    // Deploy and fund the Metered FPC (alice is the owner who authorizes mints)
    fpc = await deployMeteredContract(wallet, alice);
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
    // Mint internal balance for alice before each test
    const secret = Fr.random();
    const innerHash = await computeInnerAuthWitHash([
      secret,
      new Fr(MINT_AMOUNT),
    ]);
    const authWitness = await wallet.createAuthWit(alice, {
      consumer: fpc.address,
      innerHash,
    });

    await fpc.methods
      .mint(alice, MINT_AMOUNT, secret)
      .with({ authWitnesses: [authWitness] })
      .send({ from: alice });
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

      const receipt = await counter.methods.increment().send({
        from: alice,
        fee: {
          paymentMethod,
          gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
        },
      });

      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);

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

      const receipt = await counter.methods.increment().send({
        from: alice,
        fee: {
          paymentMethod: exactPaymentMethod,
          gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
        },
      });

      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);

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
      const freshFpc = await deployMeteredContract(wallet, alice);
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
        freshCounter.methods.increment().send({
          from: alice,
          fee: {
            paymentMethod: freshPaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );
});
