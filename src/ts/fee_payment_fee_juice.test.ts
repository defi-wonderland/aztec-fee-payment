import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { TxStatus } from "@aztec/aztec.js/tx";

import { deployCounter } from "./utils.js";

import { CounterContract } from "../artifacts/Counter.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  deployAndFundFeePayer,
} from "./aztec_harness.js";

import {
  MeteredSponsoredFeePaymentMethod,
  MeteredExactSponsoredFeePaymentMethod,
  SponsoredFeePaymentMethod,
  TeardownRevertSponsoredFeePaymentMethod,
  TeardownRevertMeteredSponsoredFeePaymentMethod,
} from "./sponsored_fee_payment.js";

import {
  TEST_TIMEOUT,
  getFeeJuiceBalances,
  mintFeeJuice,
  getGasSetup,
  getGasSetupNoTeardown,
} from "./test_utils/index.js";

describe("Fee Payment with Fee Juice", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let sponsoredFeePaymentMethod: SponsoredFeePaymentMethod;
  let meteredSponsoredFeePaymentMethod: MeteredSponsoredFeePaymentMethod;
  let meteredExactSponsoredFeePaymentMethod: MeteredExactSponsoredFeePaymentMethod;
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
        loggerName: "test:fee",
      });

    expect(feeJuiceBalance).toBeGreaterThan(0n);

    // Deploy our local fee payment contract and use it to sponsor tx fees.
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
  });

  beforeEach(async () => {
    await counter.methods.reset().send({ from: alice });
  });

  /**
   * Test sponsored fee payment with Fee Juice.
   * @expected_status SUCCESS
   * @effects Counter increments, sponsor address protocol balance decreases
   */
  it(
    "sponsored_fee_juice: SUCCESS",
    async () => {
      await counter.methods.reset().send({ from: alice });

      expect(
        await counter.methods.get_counter().simulate({
          from: alice,
        }),
      ).toBe(0n);

      const sponsorFeeJuiceBefore = await getFeeJuiceBalance(
        sponsoredFpcAddress,
        aztecNode,
      );
      expect(sponsorFeeJuiceBefore).toBeGreaterThan(0n);

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
        await counter.methods.get_counter().simulate({
          from: alice,
        }),
      ).toBe(1n);
    },
    TEST_TIMEOUT,
  );

  /**
   * Test metered sponsored fee payment with Fee Juice.
   * @expected_status SUCCESS
   * @effects Counter increments, alice's internal balance deduced (max gas cost charged upfront)
   */
  it(
    "metered_fee_juice: SUCCESS",
    async () => {
      await mintFeeJuice(feePaymentContract, alice, INITIAL_FEE_JUICE_BALANCE);

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
      expect(receipt.blockNumber).toBeDefined();

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

  /**
   * Test metered exact sponsored fee payment with Fee Juice.
   * @expected_status SUCCESS
   * @effects Counter increments, exact fees deduced and refunded
   */
  it(
    "metered_exact_fee_juice: SUCCESS",
    async () => {
      await mintFeeJuice(feePaymentContract, alice, INITIAL_FEE_JUICE_BALANCE);

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
            gasSettings: {
              gasLimits,
              teardownGasLimits,
              maxFeesPerGas,
            },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);
      expect(receipt.blockNumber).toBeDefined();

      const block = await aztecNode.getBlock(receipt.blockNumber!);
      expect(block).toBeDefined();

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

  /**
   * Test teardown revert sponsored fee payment with Fee Juice.
   * @expected_status TEARDOWN_REVERTED
   * @effects Setup succeeds and charges fees, teardown fails and reverts app logic, protocol fees still charged
   */
  it(
    "teardown_revert_sponsored_fee_juice: TEARDOWN_REVERTED",
    async () => {
      const sponsorFeeJuiceBalanceBefore = await getFeeJuiceBalance(
        sponsoredFpcAddress,
        aztecNode,
      );

      const paymentMethod = new TeardownRevertSponsoredFeePaymentMethod(
        sponsoredFpcAddress,
      );

      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
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
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.TEARDOWN_REVERTED);
      expect(receipt.blockNumber).toBeDefined();

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

  /**
   * Test teardown revert metered fee payment with Fee Juice.
   * @expected_status TEARDOWN_REVERTED
   * @effects Setup succeeds and charges fees, teardown fails and reverts app logic, protocol fees still charged
   */
  it(
    "teardown_revert_metered_fee_juice: TEARDOWN_REVERTED",
    async () => {
      await mintFeeJuice(feePaymentContract, alice, INITIAL_FEE_JUICE_BALANCE);

      const balancesBefore = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      const paymentMethod = new TeardownRevertMeteredSponsoredFeePaymentMethod(
        sponsoredFpcAddress,
      );

      const {
        maxFeesPerGas,
        maxPriorityFeesPerGas,
        gasLimits,
        teardownGasLimits,
        maxGasCost,
      } = await getGasSetup(aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
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

      const balancesAfter = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      const transactionFee = receipt.transactionFee!;

      expect(balancesAfter.sponsorFeeJuice).toBe(
        balancesBefore.sponsorFeeJuice - transactionFee,
      );

      expect(balancesAfter.internalBalance).toBe(
        balancesBefore.internalBalance - maxGasCost,
      );

      expect(
        await counter.methods.get_counter().simulate({
          from: alice,
        }),
      ).toBe(0n);
    },
    TEST_TIMEOUT,
  );
});
