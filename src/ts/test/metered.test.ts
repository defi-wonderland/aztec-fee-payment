import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TxStatus } from "@aztec/aztec.js/tx";

import { CounterContract, MeteredContract } from "../artifacts/index.js";
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

    // Deploy and fund the Metered FPC
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
    await counter.methods.reset().send({ from: alice });
    // Mint internal balance for alice before each test
    await fpc.methods.mint(alice, MINT_AMOUNT).send({ from: alice }).wait();
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
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(1n);
    },
    TEST_TIMEOUT,
  );

  it(
    "pay_fee INVALID: reverts on private failure (tx not included)",
    async () => {
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      await expect(
        counter.methods
          .revert_private()
          .send({
            from: alice,
            fee: {
              paymentMethod,
              gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
            },
          })
          .wait(),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  it(
    "pay_fee APP_LOGIC_REVERTED: fee payer still pays on public revert",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      const receipt = await counter.methods
        .revert_public()
        .send({
          from: alice,
          fee: {
            paymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(0n);
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

      // FPC paid the actual transaction fee
      expect(fpcBalanceAfter).toBe(fpcBalanceBefore - transactionFee);
      // User's internal balance was debited only the actual fee (refund happened)
      expect(internalBalanceAfter).toBe(
        internalBalanceBefore - BigInt(transactionFee),
      );
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(1n);
    },
    TEST_TIMEOUT,
  );

  it(
    "pay_fee_exact INVALID: reverts on private failure (tx not included)",
    async () => {
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetupWithTeardown(aztecNode);

      await expect(
        counter.methods
          .revert_private()
          .send({
            from: alice,
            fee: {
              paymentMethod: exactPaymentMethod,
              gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
            },
          })
          .wait(),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  it(
    "pay_fee_exact APP_LOGIC_REVERTED: fee payer still pays on public revert",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetupWithTeardown(aztecNode);

      const receipt = await counter.methods
        .revert_public()
        .send({
          from: alice,
          fee: {
            paymentMethod: exactPaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(0n);
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
