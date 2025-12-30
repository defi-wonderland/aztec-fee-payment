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
  TeardownAfterSetupRevertSponsoredFeePaymentMethod,
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
   * @effects Counter increments from 0 to 1, sponsor Fee Juice balance decreases
   */
  it(
    "sponsored_fee_juice: SUCCESS",
    async () => {
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
   * Test metered sponsored fee payment with insufficient balance in setup.
   * @expected_status DROPPED (setup reverts due to balance underflow)
   * @effects Transaction setup fails, tx not included in block, no fees charged, balances unchanged
   */
  it(
    "sponsor_metered_fee_juice: DROPPED (setup reverts)",
    async () => {
      const balancesBefore = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );
      expect(balancesBefore.internalBalance).toBe(0n);

      await expect(
        counter.methods
          .revert_private()
          .send({
            from: alice,
            fee: { paymentMethod: meteredSponsoredFeePaymentMethod },
          })
          .wait(),
      ).rejects.toThrow();

      const balancesAfter = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      expect(balancesAfter.sponsorFeeJuice).toBe(
        balancesBefore.sponsorFeeJuice,
      );
      expect(balancesAfter.internalBalance).toBe(
        balancesBefore.internalBalance,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * Test metered sponsored fee payment when private app logic reverts.
   * @expected_status DROPPED (private app logic reverts after setup succeeds)
   * @effects Setup charges max gas cost upfront, app logic fails, transaction dropped, setup charges refunded
   */
  it(
    "sponsor_metered_fee_juice: DROPPED (private app logic reverts)",
    async () => {
      await mintFeeJuice(feePaymentContract, alice, INITIAL_FEE_JUICE_BALANCE);

      const balancesBefore = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      await expect(
        counter.methods
          .revert_private()
          .send({
            from: alice,
            fee: { paymentMethod: meteredSponsoredFeePaymentMethod },
          })
          .wait(),
      ).rejects.toThrow();

      const balancesAfter = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      expect(balancesAfter.sponsorFeeJuice).toBe(
        balancesBefore.sponsorFeeJuice,
      );
      expect(balancesAfter.internalBalance).toBe(
        balancesBefore.internalBalance,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * Test metered sponsored fee payment when public app logic reverts.
   * @expected_status APP_LOGIC_REVERTED
   * @effects Setup charges max gas cost, app logic fails, sponsor pays fees, user gets partial refund
   */
  it(
    "sponsor_metered_fee_juice: APP_LOGIC_REVERTED (public app logic reverts)",
    async () => {
      await mintFeeJuice(feePaymentContract, alice, INITIAL_FEE_JUICE_BALANCE);

      const balancesBefore = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      const receipt = await counter.methods
        .revert_public()
        .send({
          from: alice,
          fee: { paymentMethod: meteredSponsoredFeePaymentMethod },
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      const balancesAfter = await getFeeJuiceBalances(
        feePaymentContract,
        alice,
        aztecNode,
      );

      expect(balancesAfter.sponsorFeeJuice).toBeLessThan(
        balancesBefore.sponsorFeeJuice,
      );
      expect(balancesAfter.internalBalance).toBeLessThan(
        balancesBefore.internalBalance,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * Test metered sponsored fee payment with successful transaction.
   * @expected_status SUCCESS
   * @effects Counter increments, sponsor pays actual transaction fee, user pays max gas cost upfront then gets refunded surplus
   */
  it(
    "sponsor_metered_fee_juice: SUCCESS (max fees are charged)",
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
   * Test metered exact sponsored fee payment with successful transaction.
   * @expected_status SUCCESS
   * @effects Counter increments, sponsor and user both pay exact transaction fee (no over-charging)
   */
  it(
    "sponsor_metered_fee_juice_exact: SUCCESS (exact fees are charged)",
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
   * Test teardown revert sponsored fee payment.
   * @expected_status TEARDOWN_REVERTED
   * @effects Setup succeeds and charges fees, teardown fails and reverts app logic, protocol fees still charged
   */
  it(
    "teardown_revert_fee_juice: TEARDOWN_REVERTED (protocol fees are charged)",
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
   * Test teardown revert sponsored fee payment.
   * @expected_status TEARDOWN_REVERTED
   * @effects Setup succeeds and charges fees, teardown fails and reverts app logic, protocol fees still charged
   */
  it(
    "teardown_revert_metered_fee_juice: TEARDOWN_REVERTED (setup is not reverted, app logic effects are reverted)",
    async () => {
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

  /**
   * Test teardown revert when teardown is set after setup ends.
   * @expected_status TEARDOWN_REVERTED
   * @effects Setup completes successfully, teardown registered late fails, app logic is reverted
   */
  it(
    "teardown_after_setup_fee_juice: TEARDOWN_REVERTED",
    async () => {
      const paymentMethod =
        new TeardownAfterSetupRevertSponsoredFeePaymentMethod(
          sponsoredFpcAddress,
        );

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: { paymentMethod },
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.TEARDOWN_REVERTED);

      expect(
        await counter.methods.get_counter().simulate({
          from: alice,
        }),
      ).toBe(0n);
    },
    TEST_TIMEOUT,
  );
});
