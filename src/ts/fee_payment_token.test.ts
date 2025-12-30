import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Fr } from "@aztec/aztec.js/fields";
import { TxStatus } from "@aztec/aztec.js/tx";

import { deployCounter } from "./utils.js";

import { CounterContract } from "../artifacts/Counter.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  deployAndFundFeePayer,
} from "./aztec_harness.js";

import {
  buildTokenSponsoredFeePaymentMethod,
  createTokenSponsorshipAuthWitness,
} from "./token_sponsorship.js";
import { TeardownRevertTokenSponsoredFeePaymentMethod } from "./sponsored_fee_payment.js";

import {
  TEST_TIMEOUT,
  getGasSetup,
  getFeePaymentBalances,
  syncTokenState,
} from "./test_utils/index.js";

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
      wallet: { dataDirectory: "pxe-test", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    counter = await deployCounter(wallet, alice);

    const { feePaymentContract: deployedFeePayer, feeJuiceBalance } =
      await deployAndFundFeePayer({
        aztecNode,
        wallet,
        claimTxSender: alice,
        produceL2Block: async () => {
          // Produce L2 blocks by sending any tx (deployer has default fee funds).
          await deployCounter(wallet, alice);
        },
        loggerName: "test:fee-token",
      });
    expect(feeJuiceBalance).toBeGreaterThan(0n);

    // Deploy our local fee payment contract and use it to sponsor tx fees.
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

  /**
   * Test metered token sponsored fee payment with successful transaction.
   * @expected_status SUCCESS
   * @effects Counter increments, user pays max gas cost in tokens, sponsor pays actual Fee Juice fee
   */
  it(
    "sponsor_metered_token: SUCCESS (max fees are charged)",
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
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/ab1c7d76-674a-49a4-a15e-6aa5a6c5991a",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "fee_payment_token.test.ts:metered_test",
            message: "Authwit created for transaction",
            data: {
              witnessHash: witness.requestHash.toString(),
              alice: alice.toString(),
              feePayer: feePaymentContract.address.toString(),
              maxGasCost: maxGasCost.toString(),
              nonce: nonce.toString(),
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "initial",
          }),
        },
      ).catch(() => {});
      // #endregion

      const balancesBefore = await getFeePaymentBalances(
        feePaymentContract,
        token,
        alice,
        aztecNode,
      );

      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/ab1c7d76-674a-49a4-a15e-6aa5a6c5991a",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "fee_payment_token.test.ts:metered_test",
            message: "Sending transaction with authwit",
            data: {
              authWitnessesCount: 1,
              feePayer: feePaymentContract.address.toString(),
              tokenAddress: token.address.toString(),
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "initial",
          }),
        },
      ).catch(() => {});
      // #endregion
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
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/ab1c7d76-674a-49a4-a15e-6aa5a6c5991a",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "fee_payment_token.test.ts:metered_test",
            message: "Transaction result",
            data: {
              status: receipt.status,
              blockNumber: receipt.blockNumber,
              txHash: receipt.txHash?.toString(),
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "initial",
          }),
        },
      ).catch(() => {});
      // #endregion

      expect(receipt.status).toBe(TxStatus.SUCCESS);
      expect(receipt.blockNumber).toBeDefined();

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

  /**
   * Test metered exact token sponsored fee payment with successful transaction.
   * @expected_status SUCCESS
   * @effects Counter increments, user and sponsor both pay exact transaction fee in tokens (no over-charging)
   */
  it(
    "sponsor_metered_token_exact: SUCCESS (exact fees are charged)",
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
      expect(receipt.blockNumber).toBeDefined();

      const expectedBaseGasCost = receipt.transactionFee!;

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

      const actualTokenCost =
        balancesBefore.alicePrivate - balancesAfter.alicePrivate;
      const sponsorTokenGain =
        balancesAfter.fpcPublic - balancesBefore.fpcPublic;

      expect(sponsorTokenGain).toBe(expectedBaseGasCost);
      expect(actualTokenCost).toBe(expectedBaseGasCost);
    },
    TEST_TIMEOUT,
  );

  /**
   * Test metered token sponsored fee payment when public app logic reverts.
   * @expected_status APP_LOGIC_REVERTED
   * @effects Setup charges max gas cost in tokens, app logic fails, sponsor receives full token payment
   */
  it(
    "sponsor_metered_token: APP_LOGIC_REVERTED (public app logic reverts)",
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
        .revert_public()
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
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      await syncTokenState(token, alice);
      const balancesAfter = await getFeePaymentBalances(
        feePaymentContract,
        token,
        alice,
        aztecNode,
      );

      expect(balancesAfter.fpcPublic - balancesBefore.fpcPublic).toBe(
        maxGasCost,
      );
      expect(balancesBefore.alicePrivate - balancesAfter.alicePrivate).toBe(
        maxGasCost,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * Test metered exact token sponsored fee payment when public app logic reverts.
   * @expected_status APP_LOGIC_REVERTED
   * @effects Setup charges tokens, app logic fails, sponsor receives partial token payment based on actual gas used
   */
  it(
    "sponsor_metered_token_exact: APP_LOGIC_REVERTED (public app logic reverts)",
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
        .revert_public()
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
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      await syncTokenState(token, alice);
      const balancesAfter = await getFeePaymentBalances(
        feePaymentContract,
        token,
        alice,
        aztecNode,
      );

      const sponsorDelta = balancesAfter.fpcPublic - balancesBefore.fpcPublic;
      const aliceDelta =
        balancesBefore.alicePrivate - balancesAfter.alicePrivate;

      expect(sponsorDelta).toBeGreaterThan(0n);
      expect(sponsorDelta).toBeLessThanOrEqual(maxGasCost);
      expect(aliceDelta).toBe(sponsorDelta);
    },
    TEST_TIMEOUT,
  );

  /**
   * Test teardown revert token sponsored fee payment.
   * @expected_status TEARDOWN_REVERTED
   * @effects Setup succeeds and charges max gas cost in tokens, teardown fails, protocol fees charged, app logic reverted
   */
  it(
    "teardown_revert: TEARDOWN_REVERTED (setup is not reverted, app-logic effects are reverted)",
    async () => {
      const {
        maxFeesPerGas,
        maxPriorityFeesPerGas,
        gasLimits,
        teardownGasLimits,
        maxGasCost,
      } = await getGasSetup(aztecNode);

      const nonce = Fr.random();
      const paymentMethod = new TeardownRevertTokenSponsoredFeePaymentMethod(
        feePaymentContract.address,
        token.address,
        nonce,
      );
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
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.TEARDOWN_REVERTED);
      expect(receipt.blockNumber).toBeDefined();

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
      expect(balancesAfter.fpcPublic - balancesBefore.fpcPublic).toBe(
        maxGasCost,
      );
      expect(balancesBefore.alicePrivate - balancesAfter.alicePrivate).toBe(
        maxGasCost,
      );
    },
    TEST_TIMEOUT,
  );
});
