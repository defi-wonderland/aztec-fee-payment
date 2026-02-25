import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TxStatus } from "@aztec/aztec.js/tx";
import { Fr } from "@aztec/aztec.js/fields";
import {
  computeInnerAuthWitHash,
  type AuthWitness,
} from "@aztec/stdlib/auth-witness";

import { CounterContract } from "../../artifacts/Counter.js";
import { MeteredContract } from "../../artifacts/Metered.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintAndPayFeePaymentMethod,
  MeteredMintThenPayFeePaymentMethod,
} from "../fee-payment-methods/index.js";
import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
} from "./harness.js";

import {
  TEST_TIMEOUT,
  deployCounter,
  deploySettledMetered,
  deployUnsettledMetered,
  getGasSetup,
  getGasSetupWithTeardown,
  getBalance,
} from "./utils.js";

/** Creates an authwit for the Metered contract's mint/mint_and_pay_fee functions. */
async function createMintAuthWit(
  wallet: TestWallet,
  signer: AztecAddress,
  fpcAddress: AztecAddress,
  amount: bigint,
  secret: Fr,
): Promise<AuthWitness> {
  const innerHash = await computeInnerAuthWitHash([new Fr(amount), secret]);
  return wallet.createAuthWit(signer, {
    consumer: fpcAddress,
    innerHash,
  });
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

    // Deploy the Metered FPC with settled owner (alice authorizes mints)
    fpc = await deploySettledMetered(wallet, alice, aztecNode);

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
    const authWitness = await createMintAuthWit(
      wallet,
      alice,
      fpc.address,
      MINT_AMOUNT,
      secret,
    );

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

      const transactionFee = receipt.transactionFee!;

      // FPC paid the actual transaction fee
      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);

      // User's internal balance was debited maxGasCost -- NOT transactionFee.
      // The difference (maxGasCost - transactionFee) is the overpayment that
      // is never refunded. This IS the "refund = 0" behavior by design.
      expect(maxGasCost).toBeGreaterThan(BigInt(transactionFee));
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

  // SKIPPED: refund == 0 edge case (partial_note.complete with amount 0).
  //
  // To trigger refund = 0 we need maxGasCost == transactionFee exactly.
  // This requires per-dimension gasLimits == gasUsed (DA and L2), but:
  //   1. The receipt only exposes a scalar transactionFee — no per-dimension
  //      gas breakdown — so we cannot solve for exact per-dimension limits.
  //   2. Gas estimation (simulate + estimateGas) under-counts setup-phase
  //      and phase-transition overhead, causing OOG when limits are tight.
  //   3. Any limit above actual usage produces refund > 0; any limit at or
  //      below risks OOG. There is no margin to work with.
  //
  // This edge case should be covered by a Noir unit test calling _refund
  // directly once the TXE supports set_as_fee_payer / teardown execution.
  it.skip(
    "pay_fee_exact SUCCESS: zero refund (refund_amount == 0)",
    async () => {
      /* intentionally empty — see comment above */
    },
    TEST_TIMEOUT,
  );

  // --- Insufficient balance tests ---

  it(
    "pay_fee INVALID: fails when user has insufficient balance (tx not included)",
    async () => {
      const testCounter = await deployCounter(wallet);
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      // Deploy FPC without minting internal balance (owner unsettled is fine
      // since pay_fee doesn't read the owner)
      const emptyFpc = await deployUnsettledMetered(wallet, alice);
      await fundL2AddressWithFeeJuiceFromL1(
        aztecNode,
        wallet,
        emptyFpc.address,
        {
          claimTxSender: alice,
          produceL2Block: async () => {
            await deployCounter(wallet);
          },
          loggerName: "test:metered-empty",
        },
      );

      const emptyPaymentMethod = new MeteredFeePaymentMethod(emptyFpc.address);

      // Should fail because alice has no internal balance
      await expect(
        testCounter.methods.increment().send({
          from: alice,
          fee: {
            paymentMethod: emptyPaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  it(
    "pay_fee_exact INVALID: fails when user has zero balance",
    async () => {
      const testCounter = await deployCounter(wallet);
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetupWithTeardown(aztecNode);

      // Deploy FPC without minting internal balance (owner unsettled is fine
      // since pay_fee_exact doesn't read the owner)
      const emptyFpc = await deployUnsettledMetered(wallet, alice);
      await fundL2AddressWithFeeJuiceFromL1(
        aztecNode,
        wallet,
        emptyFpc.address,
        {
          claimTxSender: alice,
          produceL2Block: async () => {
            await deployCounter(wallet);
          },
          loggerName: "test:metered-exact-empty",
        },
      );

      const emptyExactPaymentMethod = new MeteredExactFeePaymentMethod(
        emptyFpc.address,
      );

      // Should fail because alice has no internal balance
      await expect(
        testCounter.methods.increment().send({
          from: alice,
          fee: {
            paymentMethod: emptyExactPaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  // --- mint_and_pay_fee tests (TXE-blocked, verified here) ---

  it(
    "mint_and_pay_fee SUCCESS: mints and pays fee in a single tx",
    async () => {
      const internalBalanceBefore = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetup(aztecNode);

      const mintAmount = maxGasCost * 2n;
      const secret = Fr.random();
      const authWitness = await createMintAuthWit(
        wallet,
        alice,
        fpc.address,
        mintAmount,
        secret,
      );

      const mintAndPayMethod = new MeteredMintAndPayFeePaymentMethod(
        fpc.address,
        alice,
        mintAmount,
        secret,
        authWitness,
      );

      const receipt = await counter.methods.increment().send({
        from: alice,
        fee: {
          paymentMethod: mintAndPayMethod,
          gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
        },
      });

      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);

      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });
      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);

      // FPC paid the actual transaction fee from its FeeJuice balance
      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);

      // User's internal balance increased by (mintAmount - maxGasCost)
      // on top of whatever they had before
      expect(internalBalanceAfter).toBe(
        internalBalanceBefore + mintAmount - maxGasCost,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "mint_and_pay_fee INVALID: reverts when amount < max_gas_cost",
    async () => {
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      // Mint amount of 1 is certainly less than max_gas_cost
      const tinyAmount = 1n;
      const secret = Fr.random();
      const authWitness = await createMintAuthWit(
        wallet,
        alice,
        fpc.address,
        tinyAmount,
        secret,
      );

      const mintAndPayMethod = new MeteredMintAndPayFeePaymentMethod(
        fpc.address,
        alice,
        tinyAmount,
        secret,
        authWitness,
      );

      // Should revert: amount - max_gas_cost underflows (u128)
      await expect(
        counter.methods.increment().send({
          from: alice,
          fee: {
            paymentMethod: mintAndPayMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  // --- MeteredMintThenPayFeePaymentMethod tests ---

  it(
    "mint_then_pay_fee SUCCESS: mints and pays fee as two-step flow in a single tx",
    async () => {
      const internalBalanceBefore = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetup(aztecNode);

      const mintAmount = maxGasCost * 2n;
      const secret = Fr.random();
      const authWitness = await createMintAuthWit(
        wallet,
        alice,
        fpc.address,
        mintAmount,
        secret,
      );

      const mintThenPayMethod = new MeteredMintThenPayFeePaymentMethod(
        fpc.address,
        alice,
        mintAmount,
        secret,
        authWitness,
      );

      const receipt = await counter.methods.increment().send({
        from: alice,
        fee: {
          paymentMethod: mintThenPayMethod,
          gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
        },
      });

      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);

      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });
      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);

      // FPC paid the actual transaction fee
      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);

      // User's internal balance increased by mintAmount (from mint)
      // then decreased by maxGasCost (from pay_fee, no refund)
      expect(internalBalanceAfter).toBe(
        internalBalanceBefore + mintAmount - maxGasCost,
      );
    },
    TEST_TIMEOUT,
  );

  // --- FPC FeeJuice depletion ---

  it(
    "pay_fee INVALID: fails when FPC has no FeeJuice (even with user balance)",
    async () => {
      // Deploy FPC but do NOT fund it with FeeJuice
      const unfundedFpc = await deploySettledMetered(wallet, alice, aztecNode);

      // Mint internal balance so the user side is fine
      const secret = Fr.random();
      const authWitness = await createMintAuthWit(
        wallet,
        alice,
        unfundedFpc.address,
        MINT_AMOUNT,
        secret,
      );
      await unfundedFpc.methods
        .mint(alice, MINT_AMOUNT, secret)
        .with({ authWitnesses: [authWitness] })
        .send({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      const unfundedPaymentMethod = new MeteredFeePaymentMethod(
        unfundedFpc.address,
      );

      // Should fail: user has internal balance, but the FPC itself
      // cannot cover the sequencer fee (no FeeJuice)
      await expect(
        counter.methods.increment().send({
          from: alice,
          fee: {
            paymentMethod: unfundedPaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  it(
    "pay_fee_exact INVALID: fails when FPC has no FeeJuice (even with user balance)",
    async () => {
      // Deploy FPC but do NOT fund it with FeeJuice
      const unfundedFpc = await deploySettledMetered(wallet, alice, aztecNode);

      // Mint internal balance so the user side is fine
      const secret = Fr.random();
      const authWitness = await createMintAuthWit(
        wallet,
        alice,
        unfundedFpc.address,
        MINT_AMOUNT,
        secret,
      );
      await unfundedFpc.methods
        .mint(alice, MINT_AMOUNT, secret)
        .with({ authWitnesses: [authWitness] })
        .send({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetupWithTeardown(aztecNode);

      const unfundedExactPaymentMethod = new MeteredExactFeePaymentMethod(
        unfundedFpc.address,
      );

      // Should fail: user has internal balance, but the FPC itself
      // cannot cover the sequencer fee (no FeeJuice)
      await expect(
        counter.methods.increment().send({
          from: alice,
          fee: {
            paymentMethod: unfundedExactPaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  // --- mint_and_pay_fee edge cases ---

  it(
    "mint_and_pay_fee SUCCESS: amount == maxGasCost credits zero to user",
    async () => {
      const internalBalanceBefore = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetup(aztecNode);

      // Mint exactly maxGasCost so (amount - maxGasCost) == 0
      const mintAmount = maxGasCost;
      const secret = Fr.random();
      const authWitness = await createMintAuthWit(
        wallet,
        alice,
        fpc.address,
        mintAmount,
        secret,
      );

      const mintAndPayMethod = new MeteredMintAndPayFeePaymentMethod(
        fpc.address,
        alice,
        mintAmount,
        secret,
        authWitness,
      );

      const receipt = await counter.methods.increment().send({
        from: alice,
        fee: {
          paymentMethod: mintAndPayMethod,
          gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
        },
      });

      expect(receipt.status).toBe(TxStatus.CHECKPOINTED);

      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      // amount == maxGasCost, so (amount - maxGasCost) == 0:
      // user's internal balance should be unchanged
      expect(internalBalanceAfter).toBe(internalBalanceBefore);
    },
    TEST_TIMEOUT,
  );

  // --- Authwit replay protection ---

  it(
    "authwit replay INVALID: reusing the same secret and amount fails",
    async () => {
      const secret = Fr.random();
      const amount = 1_000_000n;

      // First mint: should succeed
      const authWitness1 = await createMintAuthWit(
        wallet,
        alice,
        fpc.address,
        amount,
        secret,
      );
      await fpc.methods
        .mint(alice, amount, secret)
        .with({ authWitnesses: [authWitness1] })
        .send({ from: alice });

      // Second mint with the same (amount, secret): the nullifier for this
      // message hash was already emitted, so this must fail regardless of
      // having a valid auth witness (Schnorr is non-deterministic)
      const authWitness2 = await createMintAuthWit(
        wallet,
        alice,
        fpc.address,
        amount,
        secret,
      );
      await expect(
        fpc.methods
          .mint(alice, amount, secret)
          .with({ authWitnesses: [authWitness2] })
          .send({ from: alice }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );
});
