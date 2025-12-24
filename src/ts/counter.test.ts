import { CounterContract } from "../artifacts/Counter.js";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  registerInitialLocalNetworkAccountsInWallet,
  TestWallet,
} from "@aztec/test-wallet/server";
import { createAztecNodeClient, AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { Gas, GasFees } from "@aztec/stdlib/gas";

import { deployCounter, deployFeePaymentContract } from "./utils.js";
import {
  MeteredSponsoredFeePaymentMethod,
  MeteredExactSponsoredFeePaymentMethod,
  SponsoredFeePaymentMethod,
} from "./sponsored_fee_payment.js";
import { fundL2AddressWithFeeJuiceFromL1 } from "./fee_juice_funding.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";
import { TxStatus } from "@aztec/aztec.js/tx";

describe("Counter Contract", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let sponsoredFeePaymentMethod: SponsoredFeePaymentMethod;
  let meteredSponsoredFeePaymentMethod: MeteredSponsoredFeePaymentMethod;
  let meteredExactSponsoredFeePaymentMethod: MeteredExactSponsoredFeePaymentMethod;
  let sponsoredFpcAddress: AztecAddress;
  let feePaymentContract: FeePaymentContract;

  const MINTED_FEE_JUICE_AMOUNT = 100_000_000_000_000_000_000n;

  beforeAll(async () => {
    aztecNode = await createAztecNodeClient("http://localhost:8080", {});
    wallet = await TestWallet.create(
      aztecNode,
      {
        dataDirectory: "pxe-test",
        proverEnabled: false,
      },
      {},
    );

    // Local network starts with predeployed funded accounts; register them in PXE for private execution.
    [alice] = await registerInitialLocalNetworkAccountsInWallet(wallet);

    // Deploy our local fee payment contract and use it to sponsor tx fees.
    feePaymentContract = await deployFeePaymentContract(wallet);
    sponsoredFpcAddress = feePaymentContract.address;
    sponsoredFeePaymentMethod = new SponsoredFeePaymentMethod(
      sponsoredFpcAddress,
    );
    meteredSponsoredFeePaymentMethod = new MeteredSponsoredFeePaymentMethod(
      sponsoredFpcAddress,
    );
    meteredExactSponsoredFeePaymentMethod =
      new MeteredExactSponsoredFeePaymentMethod(sponsoredFpcAddress);

    // Fund fee payer with FeeJuice from L1, then claim it on L2.
    const { balance: sponsoredFpcFeeJuiceBalance } =
      await fundL2AddressWithFeeJuiceFromL1(
        aztecNode,
        wallet,
        sponsoredFpcAddress,
        {
          claimTxSender: alice,
          produceL2Block: async () => {
            // Produce L2 blocks by sending a tx (deployer has default fee funds).
            await deployCounter(wallet, alice);
          },
          loggerName: "test:fee",
        },
      );

    expect(sponsoredFpcFeeJuiceBalance).toBeGreaterThan(0n);
  });

  beforeEach(async () => {
    counter = await deployCounter(wallet, alice);
  });

  it("e2e", async () => {
    const owner = await counter.methods.get_owner().simulate({
      from: alice,
    });
    expect(owner).toStrictEqual(alice);
    // default counter's value is 0
    expect(
      await counter.methods.get_counter().simulate({
        from: alice,
      }),
    ).toBe(0n);

    const sponsorBalanceBefore = await getFeeJuiceBalance(
      sponsoredFpcAddress,
      aztecNode,
    );
    expect(sponsorBalanceBefore).toBeGreaterThan(0n);

    // call to `increment`
    await counter.methods
      .increment()
      .send({
        from: alice,
        fee: { paymentMethod: sponsoredFeePaymentMethod },
      })
      .wait();

    const sponsorBalanceAfter = await getFeeJuiceBalance(
      sponsoredFpcAddress,
      aztecNode,
    );
    expect(sponsorBalanceAfter).toBeLessThan(sponsorBalanceBefore);

    // now the counter should be incremented.
    expect(
      await counter.methods.get_counter().simulate({
        from: alice,
      }),
    ).toBe(1n);
  });

  it("sponsor_metered: underflow in internal balance reverts and does NOT reduce FeeJuice", async () => {
    // NOTE: We intentionally do NOT call `mint_fee_juice` here.
    const before = await getFeeJuiceBalance(sponsoredFpcAddress, aztecNode);
    const beforeInternalBalance = await feePaymentContract.methods
      .get_fee_juice_balance(alice)
      .simulate({ from: alice });

    await expect(
      counter.methods
        .increment()
        .send({
          from: alice,
          fee: { paymentMethod: meteredSponsoredFeePaymentMethod },
        })
        .wait({ dontThrowOnRevert: true }),
    ).rejects.toThrow();

    const after = await getFeeJuiceBalance(sponsoredFpcAddress, aztecNode);
    const afterInternalBalance = await feePaymentContract.methods
      .get_fee_juice_balance(alice)
      .simulate({ from: alice });

    expect(after).toBe(before);
    expect(afterInternalBalance).toBe(beforeInternalBalance);
  });

  it("sponsor_metered: tx revert in private context is not mined (no fee charged)", async () => {
    // Mint a large internal balance so sponsor_metered can reserve max_gas_cost.
    await feePaymentContract.methods
      .mint_fee_juice(alice, MINTED_FEE_JUICE_AMOUNT)
      .send({ from: alice })
      .wait();

    const before = await getFeeJuiceBalance(sponsoredFpcAddress, aztecNode);
    const beforeInternalBalance = await feePaymentContract.methods
      .get_fee_juice_balance(alice)
      .simulate({ from: alice });

    // This tx reverts in app logic but should still burn fees (since sponsorship happens in setup).
    await expect(
      counter.methods
        .revert_private()
        .send({
          from: alice,
          fee: { paymentMethod: meteredSponsoredFeePaymentMethod },
        })
        .wait({ dontThrowOnRevert: true }),
    ).rejects.toThrow();

    // Not includable => no fee charged.
    const after = await getFeeJuiceBalance(sponsoredFpcAddress, aztecNode);
    const afterInternalBalance = await feePaymentContract.methods
      .get_fee_juice_balance(alice)
      .simulate({ from: alice });

    expect(after).toBe(before);
    expect(afterInternalBalance).toBe(beforeInternalBalance);
  });

  it("sponsor_metered: tx revert in public context is mined and still charges fees", async () => {
    // Mint a large internal balance so sponsor_metered can reserve max_gas_cost.
    await feePaymentContract.methods
      .mint_fee_juice(alice, MINTED_FEE_JUICE_AMOUNT)
      .send({ from: alice })
      .wait();

    const before = await getFeeJuiceBalance(sponsoredFpcAddress, aztecNode);
    const beforeInternalBalance = await feePaymentContract.methods
      .get_fee_juice_balance(alice)
      .simulate({ from: alice });

    const receipt = await counter.methods
      .revert_public()
      .send({
        from: alice,
        fee: { paymentMethod: meteredSponsoredFeePaymentMethod },
      })
      .wait({ dontThrowOnRevert: true });

    expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

    const after = await getFeeJuiceBalance(sponsoredFpcAddress, aztecNode);
    const afterInternalBalance = await feePaymentContract.methods
      .get_fee_juice_balance(alice)
      .simulate({ from: alice });

    expect(after).toBeLessThan(before);
    expect(afterInternalBalance).toBeLessThan(beforeInternalBalance);
  });

  it("sponsor_metered_exact: refunds surplus so internal balance only decreases by baseFee*gasLimits", async () => {
    // Mint a large internal balance so sponsor_metered_exact can reserve max_gas_cost.
    await feePaymentContract.methods
      .mint_fee_juice(alice, MINTED_FEE_JUICE_AMOUNT)
      .send({ from: alice })
      .wait();

    const beforeInternalBalance = await feePaymentContract.methods
      .get_fee_juice_balance(alice)
      .simulate({ from: alice });

    // Make max fees higher than base fees so there is always a surplus to refund.
    const baseFees: any = await (aztecNode as any).getCurrentBaseFees();
    const maxFeesPerGas = new GasFees(
      BigInt(baseFees.feePerDaGas) * 3n,
      BigInt(baseFees.feePerL2Gas) * 3n,
    );

    // Ask the wallet to estimate gas for this interaction (with our max fees),
    // then reuse the estimated limits for the real tx. This keeps the test stable
    // across protocol versions while still letting us assert the exact refund math.
    const simulation: any = await counter.methods.increment().simulate({
      from: alice,
      includeMetadata: true,
      fee: {
        paymentMethod: meteredExactSponsoredFeePaymentMethod,
        estimateGas: true,
        gasSettings: { maxFeesPerGas },
      },
    });

    const gasLimits: Gas = (simulation.estimatedGas.gasLimits as Gas).mul(1.2);
    const teardownGasLimits: Gas = (
      simulation.estimatedGas.teardownGasLimits as Gas
    ).mul(1.2);

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

    // Use the mined block's base fees (not "current" fees) to avoid flakiness if fees shift between blocks.
    const block = await aztecNode.getBlock(receipt.blockNumber!);
    expect(block).toBeDefined();
    const minedBaseFees: any = (block as any).header.globalVariables.gasFees;

    const expectedBaseGasCost =
      BigInt(minedBaseFees.feePerDaGas) * BigInt(gasLimits.daGas) +
      BigInt(minedBaseFees.feePerL2Gas) * BigInt(gasLimits.l2Gas);

    const afterInternalBalance = await feePaymentContract.methods
      .get_fee_juice_balance(alice)
      .simulate({ from: alice });

    expect(afterInternalBalance).toBe(
      beforeInternalBalance - expectedBaseGasCost,
    );
  });
});
