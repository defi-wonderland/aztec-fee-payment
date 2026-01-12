import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Fr } from "@aztec/aztec.js/fields";
import { TxStatus } from "@aztec/aztec.js/tx";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

import { CounterContract } from "../artifacts/Counter.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";
import {
  buildTokenSponsoredFeePaymentMethod,
  createTokenSponsorshipAuthWitness,
} from "../utils/authwit.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  deployAndFundFeePayer,
} from "./harness.js";

import {
  TEST_TIMEOUT,
  deployCounter,
  getGasSetup,
  getFeePaymentBalances,
  syncTokenState,
} from "./utils.js";

/**
 * Token-based fee payment tests.
 *
 * These tests verify that the FPC can sponsor transactions by collecting tokens from users.
 * The FPC calls Token.transfer_to_public() AFTER end_setup() to avoid the protocol's
 * setup phase allow list restrictions. This is safe because if the private token transfer
 * fails, the entire transaction is invalid regardless of which phase the call occurs in.
 */
describe("Fee Payment with External Tokens", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let feePaymentContract: FeePaymentContract;
  let token: TokenContract;
  const INITIAL_TOKEN_BALANCE = 10_000_000_000_000_000_000n;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-token", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    counter = await deployCounter(wallet);

    const { feePaymentContract: deployedFeePayer, feeJuiceBalance } =
      await deployAndFundFeePayer({
        aztecNode,
        wallet,
        claimTxSender: alice,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "test:fee-token",
      });
    expect(feeJuiceBalance).toBeGreaterThan(0n);
    feePaymentContract = deployedFeePayer;
  });

  beforeEach(async () => {
    await counter.methods.reset().send({ from: alice });

    token = await TokenContract.deploy(wallet, alice, "FeeToken", "FEE", 18n)
      .send({ from: alice })
      .deployed();

    await token.methods
      .mint_to_private(alice, INITIAL_TOKEN_BALANCE)
      .send({ from: alice })
      .wait();
    await token.methods.sync_private_state().simulate({ from: alice });
  });

  it(
    "metered_token: SUCCESS",
    async () => {
      const {
        maxFeesPerGas,
        maxPriorityFeesPerGas,
        gasLimits,
        teardownGasLimits,
        maxGasCost,
      } = await getGasSetup(aztecNode);

      const nonce = Fr.random();
      const paymentMethod = buildTokenSponsoredFeePaymentMethod({
        kind: "metered",
        feePayer: feePaymentContract.address,
        tokenAddress: token.address,
        nonce,
      });
      const witness = await createTokenSponsorshipAuthWitness({
        kind: "metered",
        wallet,
        token,
        from: alice,
        feePayer: feePaymentContract.address,
        amount: maxGasCost,
        nonce,
      });

      const balancesBefore = await getFeePaymentBalances(
        feePaymentContract,
        token,
        alice,
        aztecNode,
      );

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          authWitnesses: [witness],
          fee: {
            paymentMethod,
            gasSettings: {
              gasLimits,
              teardownGasLimits,
              maxFeesPerGas,
              maxPriorityFeesPerGas,
            },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      await syncTokenState(token, alice);
      const balancesAfter = await getFeePaymentBalances(
        feePaymentContract,
        token,
        alice,
        aztecNode,
      );

      expect(balancesAfter.sponsorFeeJuice).toBeLessThan(
        balancesBefore.sponsorFeeJuice,
      );
      expect(balancesAfter.fpcPublic).toBeGreaterThan(balancesBefore.fpcPublic);
      expect(balancesBefore.alicePrivate - balancesAfter.alicePrivate).toBe(
        maxGasCost,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "metered_token_exact: SUCCESS",
    async () => {
      const {
        maxFeesPerGas,
        maxPriorityFeesPerGas,
        gasLimits,
        teardownGasLimits,
        maxGasCost,
      } = await getGasSetup(aztecNode);

      const nonce = Fr.random();
      const paymentMethod = buildTokenSponsoredFeePaymentMethod({
        kind: "metered_exact",
        feePayer: feePaymentContract.address,
        tokenAddress: token.address,
        nonce,
      });
      const witness = await createTokenSponsorshipAuthWitness({
        kind: "metered_exact",
        wallet,
        token,
        from: alice,
        feePayer: feePaymentContract.address,
        amount: maxGasCost,
        nonce,
      });

      const balancesBefore = await getFeePaymentBalances(
        feePaymentContract,
        token,
        alice,
        aztecNode,
      );

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          authWitnesses: [witness],
          fee: {
            paymentMethod,
            gasSettings: {
              gasLimits,
              teardownGasLimits,
              maxFeesPerGas,
              maxPriorityFeesPerGas,
            },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const transactionFee = receipt.transactionFee!;

      await syncTokenState(token, alice);
      const balancesAfter = await getFeePaymentBalances(
        feePaymentContract,
        token,
        alice,
        aztecNode,
      );

      expect(balancesAfter.sponsorFeeJuice).toBe(
        balancesBefore.sponsorFeeJuice - transactionFee,
      );
      expect(balancesAfter.fpcPublic).toBe(
        balancesBefore.fpcPublic + transactionFee,
      );
      expect(balancesAfter.alicePrivate).toBe(
        balancesBefore.alicePrivate - transactionFee,
      );
    },
    TEST_TIMEOUT,
  );
});
