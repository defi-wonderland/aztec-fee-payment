import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { TxStatus } from "@aztec/aztec.js/tx";

import { CounterContract } from "../artifacts/Counter.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";
import {
  SponsoredFeePaymentMethod,
  MeteredSponsoredFeePaymentMethod,
  MeteredExactSponsoredFeePaymentMethod,
  TeardownRevertSponsoredFeePaymentMethod,
  TeardownRevertMeteredSponsoredFeePaymentMethod,
} from "../fee-payment-methods/index.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  deployAndFundFeePayer,
} from "./harness.js";

import {
  TEST_TIMEOUT,
  deployCounter,
  getFeeJuiceBalances,
  mintFeeJuice,
  getGasSetup,
  getGasSetupNoTeardown,
} from "./utils.js";

describe("Fee Payment with Fee Juice", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let sponsoredFeePaymentMethod: SponsoredFeePaymentMethod;
  let meteredSponsoredFeePaymentMethod: MeteredSponsoredFeePaymentMethod;
  let meteredExactSponsoredFeePaymentMethod: MeteredExactSponsoredFeePaymentMethod;
  let teardownRevertSponsoredFeePaymentMethod: TeardownRevertSponsoredFeePaymentMethod;
  let teardownRevertMeteredSponsoredFeePaymentMethod: TeardownRevertMeteredSponsoredFeePaymentMethod;
  let sponsoredFpcAddress: AztecAddress;
  let feePaymentContract: FeePaymentContract;

  const INITIAL_FEE_JUICE_BALANCE = 100_000_000_000_000_000_000n;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-fee-juice", proverEnabled: false },
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
        loggerName: "test:fee",
      });

    expect(feeJuiceBalance).toBeGreaterThan(0n);
    feePaymentContract = deployedFeePayer;
    sponsoredFpcAddress = feePaymentContract.address;
    sponsoredFeePaymentMethod = new SponsoredFeePaymentMethod(
      sponsoredFpcAddress,
    );
    meteredSponsoredFeePaymentMethod = new MeteredSponsoredFeePaymentMethod(
      sponsoredFpcAddress,
    );
    meteredExactSponsoredFeePaymentMethod =
      new MeteredExactSponsoredFeePaymentMethod(sponsoredFpcAddress);
    teardownRevertSponsoredFeePaymentMethod =
      new TeardownRevertSponsoredFeePaymentMethod(sponsoredFpcAddress);
    teardownRevertMeteredSponsoredFeePaymentMethod =
      new TeardownRevertMeteredSponsoredFeePaymentMethod(sponsoredFpcAddress);
  });

  beforeEach(async () => {
    await counter.methods.reset().send({ from: alice });
    await mintFeeJuice(feePaymentContract, alice, INITIAL_FEE_JUICE_BALANCE);
  });

  it(
    "sponsored_fee_juice: SUCCESS",
    async () => {
      const sponsorFeeJuiceBefore = await getFeeJuiceBalance(
        sponsoredFpcAddress,
        aztecNode,
      );

      await counter.methods
        .increment()
        .send({
          from: alice,
          fee: { paymentMethod: sponsoredFeePaymentMethod },
        })
        .wait();

      const sponsorFeeJuiceAfter = await getFeeJuiceBalance(
        sponsoredFpcAddress,
        aztecNode,
      );
      expect(sponsorFeeJuiceAfter).toBeLessThan(sponsorFeeJuiceBefore);

      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(1n);
    },
    TEST_TIMEOUT,
  );

  it(
    "metered_fee_juice: SUCCESS",
    async () => {
      const balancesBefore = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      const {
        maxFeesPerGas,
        maxPriorityFeesPerGas,
        gasLimits,
        teardownGasLimits,
        maxGasCost,
      } = await getGasSetupNoTeardown(aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: {
            paymentMethod: meteredSponsoredFeePaymentMethod,
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
      const balancesAfter = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      expect(balancesAfter.sponsorFeeJuice).toBe(
        balancesBefore.sponsorFeeJuice - transactionFee,
      );
      expect(balancesAfter.internalBalance).toBe(
        balancesBefore.internalBalance - maxGasCost,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "metered_exact_fee_juice: SUCCESS",
    async () => {
      const balancesBefore = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: {
            paymentMethod: meteredExactSponsoredFeePaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const transactionFee = receipt.transactionFee!;
      const balancesAfter = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      expect(balancesAfter.sponsorFeeJuice).toBe(
        balancesBefore.sponsorFeeJuice - transactionFee,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "teardown_revert_sponsored_fee_juice: TEARDOWN_REVERTED",
    async () => {
      const sponsorFeeJuiceBalanceBefore = await getFeeJuiceBalance(
        sponsoredFpcAddress,
        aztecNode,
      );
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: {
            paymentMethod: teardownRevertSponsoredFeePaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.TEARDOWN_REVERTED);

      const sponsorFeeJuiceBalanceAfter = await getFeeJuiceBalance(
        sponsoredFpcAddress,
        aztecNode,
      );
      const transactionFee = receipt.transactionFee!;
      expect(sponsorFeeJuiceBalanceAfter).toBe(
        sponsorFeeJuiceBalanceBefore - transactionFee,
      );
    },
    TEST_TIMEOUT,
  );
});
