import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { Gas } from "@aztec/stdlib/gas";
import { Fr } from "@aztec/aztec.js/fields";
import { TxStatus } from "@aztec/aztec.js/tx";

import { deployCounter } from "./utils.js";

import { CounterContract } from "../artifacts/Counter.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import {
  LOCAL_AZTEC_NODE_URL,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  createLocalNetworkContext,
  deployAndFundFeePayer,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
} from "./aztec_harness.js";
import {
  buildTokenSponsoredFeePaymentMethod,
  createTokenSponsorshipAuthWitness,
} from "./token_sponsorship.js";
import { TeardownRevertTokenSponsoredFeePaymentMethod } from "./sponsored_fee_payment.js";

describe("FeePayment token sponsorship", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let aztecNode: AztecNode;

  let counter: CounterContract;
  let feePaymentContract: FeePaymentContract;
  let token: TokenContract;
  const INITIAL_PRIVATE_TOKEN_BALANCE = 10_000_000_000_000_000_000n;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

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
    feePaymentContract = deployedFeePayer;
  });

  beforeEach(async () => {
    counter = await deployCounter(wallet, alice);

    token = await TokenContract.deploy(wallet, alice, "FeeToken", "FEE", 18n)
      .send({ from: alice })
      .deployed();

    await token.methods
      .mint_to_private(alice, INITIAL_PRIVATE_TOKEN_BALANCE)
      .send({ from: alice })
      .wait();
    await token.methods.sync_private_state().simulate({ from: alice });
  });

  it("sponsor_metered_token: charges max_gas_cost in tokens (private -> FeePayment public) using authwit", async () => {
    const baseFees: any = await aztecNode.getCurrentBaseFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost = maxGasCostFor(maxFeesPerGas, gasLimits);

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

    const sponsorBalanceBefore = await getFeeJuiceBalance(
      feePaymentContract.address,
      aztecNode,
    );
    const fpcPublicBefore = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateBefore = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

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
          },
        },
      })
      .wait();

    expect(receipt.status).toBe(TxStatus.SUCCESS);

    await token.methods.sync_private_state().simulate({ from: alice });

    const sponsorBalanceAfter = await getFeeJuiceBalance(
      feePaymentContract.address,
      aztecNode,
    );
    const fpcPublicAfter = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateAfter = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

    // `sponsor_metered_token` reserves the max gas cost by transferring tokens from Alice's
    // private balance to the sponsor's public balance.
    expect(sponsorBalanceAfter).toBeLessThan(sponsorBalanceBefore);
    expect(fpcPublicAfter).toBeGreaterThan(fpcPublicBefore);
    expect(alicePrivateBefore - alicePrivateAfter).toBe(maxGasCost);
  }, 300_000);

  it("sponsor_metered_token_exact: refunds surplus so net token cost equals baseFee*gasLimits", async () => {
    const baseFees: any = await aztecNode.getCurrentBaseFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost = maxGasCostFor(maxFeesPerGas, gasLimits);

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

    const sponsorBalanceBefore = await getFeeJuiceBalance(
      feePaymentContract.address,
      aztecNode,
    );
    const fpcPublicBefore = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateBefore = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

    const sponsorFeeJuiceBefore = await getFeeJuiceBalance(
      feePaymentContract.address,
      aztecNode,
    );
    expect(sponsorFeeJuiceBefore).toBeGreaterThan(0n);

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
          },
        },
      })
      .wait();

    expect(receipt.status).toBe(TxStatus.SUCCESS);
    expect(receipt.blockNumber).toBeDefined();

    // Use the mined block's base fees to avoid flakiness.
    const block = await aztecNode.getBlock(receipt.blockNumber!);
    expect(block).toBeDefined();
    const minedBaseFees: any = (block as any).header.globalVariables.gasFees;

    const expectedBaseGasCost =
      BigInt(minedBaseFees.feePerDaGas) * BigInt(gasLimits.daGas) +
      BigInt(minedBaseFees.feePerL2Gas) * BigInt(gasLimits.l2Gas);

    await token.methods.sync_private_state().simulate({ from: alice });

    const sponsorBalanceAfter = await getFeeJuiceBalance(
      feePaymentContract.address,
      aztecNode,
    );
    const fpcPublicAfter = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateAfter = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

    expect(sponsorBalanceAfter).toBeLessThan(sponsorBalanceBefore);
    expect(fpcPublicAfter - fpcPublicBefore).toBe(expectedBaseGasCost);
    expect(alicePrivateBefore - alicePrivateAfter).toBe(expectedBaseGasCost);
  }, 300_000);

  it("sponsor_metered_token: tx reverts but fee payer token balance still increases", async () => {
    const baseFees: any = await aztecNode.getCurrentBaseFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost = maxGasCostFor(maxFeesPerGas, gasLimits);

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

    const fpcPublicBefore = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateBefore = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

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
          },
        },
      })
      .wait({ dontThrowOnRevert: true });

    expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

    await token.methods.sync_private_state().simulate({ from: alice });

    const fpcPublicAfter = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateAfter = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

    // Even though the app logic reverted, sponsorship happens in setup, so the sponsor still
    // receives the reserved max gas cost in tokens.
    expect(fpcPublicAfter - fpcPublicBefore).toBe(maxGasCost);
    expect(alicePrivateBefore - alicePrivateAfter).toBe(maxGasCost);
  }, 300_000);

  it("sponsor_metered_token_exact: tx reverts but fee payer token balance still increases", async () => {
    const baseFees: any = await aztecNode.getCurrentBaseFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost = maxGasCostFor(maxFeesPerGas, gasLimits);

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

    const fpcPublicBefore = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateBefore = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

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
          },
        },
      })
      .wait({ dontThrowOnRevert: true });

    expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

    await token.methods.sync_private_state().simulate({ from: alice });

    const fpcPublicAfter = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateAfter = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

    const sponsorDelta = fpcPublicAfter - fpcPublicBefore;
    const aliceDelta = alicePrivateBefore - alicePrivateAfter;

    // Even though the app logic reverted, the sponsor should still get paid in tokens.
    expect(sponsorDelta).toBeGreaterThan(0n);
    expect(sponsorDelta).toBeLessThanOrEqual(maxGasCost);
    expect(aliceDelta).toBe(sponsorDelta);
  }, 300_000);

  it("teardown_revert_token: tx is mined with TEARDOWN_REVERTED, charges fees, and does not apply app logic", async () => {
    const baseFees: any = await aztecNode.getCurrentBaseFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost = maxGasCostFor(maxFeesPerGas, gasLimits);

    // --- Teardown failure: setup succeeds (authwit present), but teardown callback reverts.
    // This produces a mined tx with status `TEARDOWN_REVERTED` (distinct from setup failure and app-logic revert).
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

    const sponsorFeeJuiceBefore = await getFeeJuiceBalance(
      feePaymentContract.address,
      aztecNode,
    );
    const fpcPublicBefore = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateBefore = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

    const receipt = await counter.methods
      .increment()
      .send({
        from: alice,
        authWitnesses: [witness],
        fee: {
          paymentMethod,
          gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
        },
      })
      .wait({ dontThrowOnRevert: true });

    expect(receipt.status).toBe(TxStatus.TEARDOWN_REVERTED);
    expect(receipt.blockNumber).toBeDefined();

    await token.methods.sync_private_state().simulate({ from: alice });

    const sponsorFeeJuiceAfter = await getFeeJuiceBalance(
      feePaymentContract.address,
      aztecNode,
    );
    const fpcPublicAfter = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateAfter = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

    // Even though teardown reverted, the tx is still mined:
    // - protocol fees are charged (FeeJuice decreases)
    // - setup effects persist (reserved max gas cost in tokens was transferred)
    expect(sponsorFeeJuiceAfter).toBeLessThan(sponsorFeeJuiceBefore);
    expect(fpcPublicAfter - fpcPublicBefore).toBe(maxGasCost);
    expect(alicePrivateBefore - alicePrivateAfter).toBe(maxGasCost);
    expect(await counter.methods.get_counter().simulate({ from: alice })).toBe(
      0n,
    );
  }, 300_000);
});
