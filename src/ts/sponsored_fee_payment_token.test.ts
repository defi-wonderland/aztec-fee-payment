import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  registerInitialLocalNetworkAccountsInWallet,
  TestWallet,
} from "@aztec/test-wallet/server";
import { createAztecNodeClient, AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import { Fr } from "@aztec/aztec.js/fields";
import { TxStatus } from "@aztec/aztec.js/tx";
import {
  DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  DEFAULT_TEARDOWN_L2_GAS_LIMIT,
  DEFAULT_DA_GAS_LIMIT,
  DEFAULT_L2_GAS_LIMIT,
} from "@aztec/constants";

import { deployCounter, deployFeePaymentContract } from "./utils.js";
import { fundL2AddressWithFeeJuiceFromL1 } from "./fee_juice_funding.js";

import { CounterContract } from "../artifacts/Counter.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import {
  SponsoredFeePaymentMethod,
  MeteredTokenSponsoredFeePaymentMethod,
  MeteredExactTokenSponsoredFeePaymentMethod,
} from "./sponsored_fee_payment.js";

describe("FeePayment token sponsorship", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let aztecNode: AztecNode;

  let counter: CounterContract;
  let feePaymentContract: FeePaymentContract;
  let token: TokenContract;

  let sponsoredFeePaymentMethod: SponsoredFeePaymentMethod;

  const REASONABLE_TEARDOWN_GAS_LIMITS = Gas.from({
    daGas: DEFAULT_TEARDOWN_DA_GAS_LIMIT,
    l2Gas: DEFAULT_TEARDOWN_L2_GAS_LIMIT,
  });
  const REASONABLE_GAS_LIMITS = Gas.from({
    daGas: DEFAULT_DA_GAS_LIMIT,
    l2Gas: DEFAULT_L2_GAS_LIMIT,
  });
  const INITIAL_PRIVATE_TOKEN_BALANCE = 10_000_000_000_000_000_000n;

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
    sponsoredFeePaymentMethod = new SponsoredFeePaymentMethod(
      feePaymentContract.address,
    );

    // Fund fee payer with FeeJuice from L1, then claim it on L2.
    const { balance } = await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      feePaymentContract.address,
      {
        claimTxSender: alice,
        produceL2Block: async () => {
          // Produce L2 blocks by sending any tx (deployer has default fee funds).
          await deployCounter(wallet, alice);
        },
        loggerName: "test:fee-token",
      },
    );
    expect(balance).toBeGreaterThan(0n);
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
    const maxFeesPerGas = new GasFees(
      BigInt(baseFees.feePerDaGas) * 3n,
      BigInt(baseFees.feePerL2Gas) * 3n,
    );

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost =
      BigInt(maxFeesPerGas.feePerDaGas) * BigInt(gasLimits.daGas) +
      BigInt(maxFeesPerGas.feePerL2Gas) * BigInt(gasLimits.l2Gas);

    const nonce = Fr.random();
    const paymentMethod = new MeteredTokenSponsoredFeePaymentMethod(
      feePaymentContract.address,
      token.address,
      nonce,
    );

    const tokenTransferAction = token
      .withWallet(wallet)
      .methods.transfer_to_public(
        alice,
        feePaymentContract.address,
        maxGasCost,
        nonce,
      );
    const intent = {
      caller: feePaymentContract.address,
      action: tokenTransferAction,
    };
    const witness = await wallet.createAuthWit(alice, intent);

    const before = await getFeeJuiceBalance(
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

    const after = await getFeeJuiceBalance(
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
    expect(after).toBeLessThan(before);
    expect(fpcPublicAfter).toBeGreaterThan(fpcPublicBefore);
    expect(alicePrivateBefore - alicePrivateAfter).toBe(maxGasCost);
  }, 300_000);

  it("sponsor_metered_token_exact: refunds surplus so net token cost equals baseFee*gasLimits", async () => {
    const baseFees: any = await aztecNode.getCurrentBaseFees();
    const maxFeesPerGas = new GasFees(
      BigInt(baseFees.feePerDaGas) * 3n,
      BigInt(baseFees.feePerL2Gas) * 3n,
    );

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost =
      BigInt(maxFeesPerGas.feePerDaGas) * BigInt(gasLimits.daGas) +
      BigInt(maxFeesPerGas.feePerL2Gas) * BigInt(gasLimits.l2Gas);

    const nonce = Fr.random();
    const paymentMethod = new MeteredExactTokenSponsoredFeePaymentMethod(
      feePaymentContract.address,
      token.address,
      nonce,
    );

    const tokenTransferAction = token
      .withWallet(wallet)
      .methods.transfer_to_public_and_prepare_private_balance_increase(
        alice,
        feePaymentContract.address,
        maxGasCost,
        nonce,
      );
    const intent = {
      caller: feePaymentContract.address,
      action: tokenTransferAction,
    };
    const witness = await wallet.createAuthWit(alice, intent);

    const before = await getFeeJuiceBalance(
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

    const after = await getFeeJuiceBalance(
      feePaymentContract.address,
      aztecNode,
    );
    const fpcPublicAfter = await token.methods
      .balance_of_public(feePaymentContract.address)
      .simulate({ from: alice });
    const alicePrivateAfter = await token.methods
      .balance_of_private(alice)
      .simulate({ from: alice });

    expect(after).toBeLessThan(before);
    expect(fpcPublicAfter - fpcPublicBefore).toBe(expectedBaseGasCost);
    expect(alicePrivateBefore - alicePrivateAfter).toBe(expectedBaseGasCost);
  }, 300_000);

  it("sponsor_metered_token: tx reverts but fee payer token balance still increases", async () => {
    const baseFees: any = await aztecNode.getCurrentBaseFees();
    const maxFeesPerGas = new GasFees(
      BigInt(baseFees.feePerDaGas) * 3n,
      BigInt(baseFees.feePerL2Gas) * 3n,
    );

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost =
      BigInt(maxFeesPerGas.feePerDaGas) * BigInt(gasLimits.daGas) +
      BigInt(maxFeesPerGas.feePerL2Gas) * BigInt(gasLimits.l2Gas);

    const nonce = Fr.random();
    const paymentMethod = new MeteredTokenSponsoredFeePaymentMethod(
      feePaymentContract.address,
      token.address,
      nonce,
    );

    const tokenTransferAction = token
      .withWallet(wallet)
      .methods.transfer_to_public(
        alice,
        feePaymentContract.address,
        maxGasCost,
        nonce,
      );
    const intent = {
      caller: feePaymentContract.address,
      action: tokenTransferAction,
    };
    const witness = await wallet.createAuthWit(alice, intent);

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
    const maxFeesPerGas = new GasFees(
      BigInt(baseFees.feePerDaGas) * 3n,
      BigInt(baseFees.feePerL2Gas) * 3n,
    );

    const gasLimits: Gas = REASONABLE_GAS_LIMITS;
    const teardownGasLimits: Gas = REASONABLE_TEARDOWN_GAS_LIMITS;

    const maxGasCost =
      BigInt(maxFeesPerGas.feePerDaGas) * BigInt(gasLimits.daGas) +
      BigInt(maxFeesPerGas.feePerL2Gas) * BigInt(gasLimits.l2Gas);

    const nonce = Fr.random();
    const paymentMethod = new MeteredExactTokenSponsoredFeePaymentMethod(
      feePaymentContract.address,
      token.address,
      nonce,
    );

    const tokenTransferAction = token
      .withWallet(wallet)
      .methods.transfer_to_public_and_prepare_private_balance_increase(
        alice,
        feePaymentContract.address,
        maxGasCost,
        nonce,
      );
    const intent = {
      caller: feePaymentContract.address,
      action: tokenTransferAction,
    };
    const witness = await wallet.createAuthWit(alice, intent);

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
});
