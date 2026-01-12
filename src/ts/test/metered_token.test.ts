import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TxStatus } from "@aztec/aztec.js/tx";
import { Fr } from "@aztec/aztec.js/fields";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

import { CounterContract, MeteredTokenContract } from "../artifacts/index.js";

import {
  MeteredTokenFeePaymentMethod,
  MeteredTokenExactFeePaymentMethod,
} from "../fee-payment-methods/index.js";
import { deployMeteredTokenContract } from "../utils/deploy.js";
import {
  createMeteredTokenAuthWitness,
  createMeteredTokenExactAuthWitness,
} from "../utils/authwit.js";

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

describe("MeteredToken Fee Payment Contract", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let fpc: MeteredTokenContract;
  let token: TokenContract;

  const TOKEN_MINT_AMOUNT = 1_000_000_000_000_000_000_000n;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-metered-token", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    // Deploy counter for testing
    counter = await deployCounter(wallet);

    // Deploy token
    token = await TokenContract.deploy(wallet, alice, "TestToken", "TT", 18)
      .send({ from: alice })
      .deployed();

    // Mint tokens to alice (private)
    await token.methods
      .mint_to_private(alice, TOKEN_MINT_AMOUNT)
      .send({ from: alice })
      .wait();

    // Deploy and fund the MeteredToken FPC
    fpc = await deployMeteredTokenContract(wallet, token.address);
    const { balance } = await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      fpc.address,
      {
        claimTxSender: alice,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "test:metered-token",
      },
    );
    expect(balance).toBeGreaterThan(0n);
  });

  beforeEach(async () => {
    await counter.methods.reset().send({ from: alice });
  });

  // --- pay_fee (no refund) tests ---

  it(
    "pay_fee SUCCESS: sponsors transaction with token payment",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const aliceTokenBalanceBefore = await token.methods
        .balance_of_private(alice)
        .simulate({ from: alice });
      const fpcTokenBalanceBefore = await token.methods
        .balance_of_public(fpc.address)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetup(aztecNode);

      // Create authwit for token transfer
      const nonce = Fr.random();
      const authwit = await createMeteredTokenAuthWitness({
        wallet,
        token,
        from: alice,
        fpcAddress: fpc.address,
        amount: maxGasCost,
        nonce,
      });

      const paymentMethod = new MeteredTokenFeePaymentMethod(
        fpc.address,
        nonce,
      );

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          authWitnesses: [authwit],
          fee: {
            paymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      const aliceTokenBalanceAfter = await token.methods
        .balance_of_private(alice)
        .simulate({ from: alice });
      const fpcTokenBalanceAfter = await token.methods
        .balance_of_public(fpc.address)
        .simulate({ from: alice });

      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);
      // Alice paid maxGasCost in tokens (no refund in pay_fee variant)
      expect(aliceTokenBalanceAfter).toBe(aliceTokenBalanceBefore - maxGasCost);
      // FPC received maxGasCost in tokens
      expect(fpcTokenBalanceAfter).toBe(fpcTokenBalanceBefore + maxGasCost);
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(1n);
    },
    TEST_TIMEOUT,
  );

  it(
    "pay_fee INVALID: reverts on private failure (tx not included)",
    async () => {
      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetup(aztecNode);

      const nonce = Fr.random();
      const authwit = await createMeteredTokenAuthWitness({
        wallet,
        token,
        from: alice,
        fpcAddress: fpc.address,
        amount: maxGasCost,
        nonce,
      });

      const paymentMethod = new MeteredTokenFeePaymentMethod(
        fpc.address,
        nonce,
      );

      await expect(
        counter.methods
          .revert_private()
          .send({
            from: alice,
            authWitnesses: [authwit],
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

  // SKIPPED: Token transfer_to_public needs to occur in the setup phase to ensure
  // the FPC receives tokens before being set as fee payer. Currently, due to technical
  // constraints, the transfer happens in app logic phase which causes the token balance
  // assertions to be unreliable when app logic reverts (the transfer may be rolled back).
  it.skip(
    "pay_fee APP_LOGIC_REVERTED: fee payer still pays on public revert",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const aliceTokenBalanceBefore = await token.methods
        .balance_of_private(alice)
        .simulate({ from: alice });
      const fpcTokenBalanceBefore = await token.methods
        .balance_of_public(fpc.address)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetup(aztecNode);

      const nonce = Fr.random();
      const authwit = await createMeteredTokenAuthWitness({
        wallet,
        token,
        from: alice,
        fpcAddress: fpc.address,
        amount: maxGasCost,
        nonce,
      });

      const paymentMethod = new MeteredTokenFeePaymentMethod(
        fpc.address,
        nonce,
      );

      const receipt = await counter.methods
        .revert_public()
        .send({
          from: alice,
          authWitnesses: [authwit],
          fee: {
            paymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      const aliceTokenBalanceAfter = await token.methods
        .balance_of_private(alice)
        .simulate({ from: alice });
      const fpcTokenBalanceAfter = await token.methods
        .balance_of_public(fpc.address)
        .simulate({ from: alice });

      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);
      // Alice paid maxGasCost in tokens (no refund in pay_fee variant)
      expect(aliceTokenBalanceAfter).toBe(aliceTokenBalanceBefore - maxGasCost);
      // FPC received maxGasCost in tokens
      expect(fpcTokenBalanceAfter).toBe(fpcTokenBalanceBefore + maxGasCost);
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(0n);
    },
    TEST_TIMEOUT,
  );

  // --- pay_fee_exact (with refund) tests ---

  it(
    "pay_fee_exact SUCCESS: sponsors transaction and refunds unused tokens",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const aliceTokenBalanceBefore = await token.methods
        .balance_of_private(alice)
        .simulate({ from: alice });
      const fpcTokenBalanceBefore = await token.methods
        .balance_of_public(fpc.address)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetupWithTeardown(aztecNode);

      // Create authwit for token transfer with refund
      const nonce = Fr.random();
      const authwit = await createMeteredTokenExactAuthWitness({
        wallet,
        token,
        from: alice,
        fpcAddress: fpc.address,
        amount: maxGasCost,
        nonce,
      });

      const paymentMethod = new MeteredTokenExactFeePaymentMethod(
        fpc.address,
        nonce,
      );

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          authWitnesses: [authwit],
          fee: {
            paymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      const aliceTokenBalanceAfter = await token.methods
        .balance_of_private(alice)
        .simulate({ from: alice });
      const fpcTokenBalanceAfter = await token.methods
        .balance_of_public(fpc.address)
        .simulate({ from: alice });

      const transactionFee = receipt.transactionFee!;

      // FPC paid the actual transaction fee
      expect(fpcBalanceAfter).toBe(fpcBalanceBefore - transactionFee);
      // Alice paid exactly the transaction fee in tokens (refund works)
      expect(aliceTokenBalanceAfter).toBe(
        aliceTokenBalanceBefore - transactionFee,
      );
      // FPC received exactly the transaction fee in tokens
      expect(fpcTokenBalanceAfter).toBe(fpcTokenBalanceBefore + transactionFee);
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(1n);
    },
    TEST_TIMEOUT,
  );

  it(
    "pay_fee_exact INVALID: reverts on private failure (tx not included)",
    async () => {
      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetupWithTeardown(aztecNode);

      const nonce = Fr.random();
      const authwit = await createMeteredTokenExactAuthWitness({
        wallet,
        token,
        from: alice,
        fpcAddress: fpc.address,
        amount: maxGasCost,
        nonce,
      });

      const paymentMethod = new MeteredTokenExactFeePaymentMethod(
        fpc.address,
        nonce,
      );

      await expect(
        counter.methods
          .revert_private()
          .send({
            from: alice,
            authWitnesses: [authwit],
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

  // SKIPPED: Token transfer_to_public needs to occur in the setup phase to ensure
  // the FPC receives tokens before being set as fee payer. Currently, due to technical
  // constraints, the transfer happens in app logic phase. When app logic reverts, the
  // token transfer is rolled back, and the teardown refund also fails (BOTH_REVERTED).
  it.skip(
    "pay_fee_exact APP_LOGIC_REVERTED: fee payer still pays on public revert",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const aliceTokenBalanceBefore = await token.methods
        .balance_of_private(alice)
        .simulate({ from: alice });
      const fpcTokenBalanceBefore = await token.methods
        .balance_of_public(fpc.address)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetupWithTeardown(aztecNode);

      const nonce = Fr.random();
      const authwit = await createMeteredTokenExactAuthWitness({
        wallet,
        token,
        from: alice,
        fpcAddress: fpc.address,
        amount: maxGasCost,
        nonce,
      });

      const paymentMethod = new MeteredTokenExactFeePaymentMethod(
        fpc.address,
        nonce,
      );

      const receipt = await counter.methods
        .revert_public()
        .send({
          from: alice,
          authWitnesses: [authwit],
          fee: {
            paymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      const aliceTokenBalanceAfter = await token.methods
        .balance_of_private(alice)
        .simulate({ from: alice });
      const fpcTokenBalanceAfter = await token.methods
        .balance_of_public(fpc.address)
        .simulate({ from: alice });

      const transactionFee = receipt.transactionFee!;

      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);
      // Alice paid exactly the transaction fee (refund works even on revert)
      expect(aliceTokenBalanceAfter).toBe(
        aliceTokenBalanceBefore - transactionFee,
      );
      // FPC received exactly the transaction fee
      expect(fpcTokenBalanceAfter).toBe(fpcTokenBalanceBefore + transactionFee);
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(0n);
    },
    TEST_TIMEOUT,
  );
});
