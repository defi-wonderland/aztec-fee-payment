import { describe, it, expect, beforeAll } from "vitest";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Fr } from "@aztec/aztec.js/fields";
import { FeeJuiceContract } from "@aztec/noir-contracts.js/FeeJuice";
import { ProtocolContractAddress } from "@aztec/protocol-contracts";

import { BridgedFPCContract } from "../../artifacts/BridgedFPC.js";
import { MeteredFeePaymentMethod } from "../fee-payment-methods/index.js";
import { registerBridgedContract } from "../utils/deploy.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
  bridgeForMintBridged,
} from "./harness.js";

import {
  TEST_TIMEOUT,
  deployCounter,
  getGasSetup,
  getBalance,
} from "./utils.js";

describe("Bridged FPC", () => {
  let wallet: EmbeddedWallet;
  let alice: AztecAddress;
  let bob: AztecAddress;
  let aztecNode: AztecNode;
  let fpc: BridgedFPCContract;
  let paymentMethod: MeteredFeePaymentMethod;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-bridged", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;
    bob = ctx.accounts[1]!;

    // Register the BridgedFPC — no deployment transaction needed (fully private contract).
    fpc = await registerBridgedContract(wallet);

    // Fund the FPC's public FeeJuice balance so it can pay sequencers.
    // This uses a random internal secret (not the claimer-bound bridge flow).
    const { balance } = await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      fpc.address,
      {
        claimTxSender: alice,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "test:bridged-fpc-fund",
      },
    );
    expect(balance).toBeGreaterThan(0n);

    paymentMethod = new MeteredFeePaymentMethod(fpc.address);
  });

  // --- mint_bridged success → pay_fee ---
  // Both behaviors are tested in sequence within a single test: mint_bridged credits
  // a wFJ balance that pay_fee immediately consumes. Splitting would require a second
  // L1→L2 bridge round-trip purely for setup, making the suite significantly slower
  // without adding meaningful isolation.

  it(
    "mint_bridged SUCCESS → pay_fee: bridge claim credited as wFJ, sponsors tx",
    async () => {
      const counter = await deployCounter(wallet);
      const salt = Fr.random();

      // Step 1: Bridge from L1 with alice's claimer-bound secret.
      const { secret, claimAmount, leafIndex } = await bridgeForMintBridged(
        aztecNode,
        fpc.address,
        alice,
        salt,
        async () => {
          await deployCounter(wallet);
        },
        { loggerName: "test:bridged-mint-success" },
      );

      // Step 2: Claim FeeJuice on L2 — credits FPC's public FeeJuice balance
      //         and emits the FeeJuice nullifier.
      const feeJuice = FeeJuiceContract.at(
        ProtocolContractAddress.FeeJuice,
        wallet,
      );
      await feeJuice.methods
        .claim(fpc.address, claimAmount, secret, leafIndex)
        .send({ from: alice });

      // Step 3: Mint internal wFJ balance by proving the FeeJuice nullifier exists.
      const balanceBefore = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      await fpc.methods
        .mint_bridged(claimAmount, salt, leafIndex)
        .send({ from: alice });

      const balanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      expect(balanceAfter).toBe(balanceBefore + BigInt(claimAmount));

      // Step 4: Sponsor a counter increment using the wFJ balance.
      const fpcFeeJuiceBefore = await getBalance(fpc.address, aztecNode);
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

      expect(receipt.isMined()).toBe(true);
      expect(receipt.hasExecutionSucceeded()).toBe(true);

      const fpcFeeJuiceAfter = await getBalance(fpc.address, aztecNode);
      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      // FPC paid sequencer from its public FeeJuice balance.
      expect(fpcFeeJuiceAfter).toBeLessThan(fpcFeeJuiceBefore);
      // Alice's internal wFJ balance decreased by max gas cost (no refund).
      expect(internalBalanceAfter).toBe(internalBalanceBefore - maxGasCost);
    },
    TEST_TIMEOUT,
  );

  // --- mint_bridged double-spend ---

  it(
    "mint_bridged double-spend REVERT: second call with same leaf_index fails",
    async () => {
      const salt = Fr.random();

      // Bridge from L1.
      const { secret, claimAmount, leafIndex } = await bridgeForMintBridged(
        aztecNode,
        fpc.address,
        alice,
        salt,
        async () => {
          await deployCounter(wallet);
        },
        { loggerName: "test:bridged-double-spend" },
      );

      // Claim FeeJuice on L2.
      const feeJuice = FeeJuiceContract.at(
        ProtocolContractAddress.FeeJuice,
        wallet,
      );
      await feeJuice.methods
        .claim(fpc.address, claimAmount, secret, leafIndex)
        .send({ from: alice });

      // First mint_bridged succeeds.
      await fpc.methods
        .mint_bridged(claimAmount, salt, leafIndex)
        .send({ from: alice });

      // Second mint_bridged with the same parameters must fail —
      // the FPC-scoped nullifier is already emitted.
      await expect(
        fpc.methods.mint_bridged(claimAmount, salt, leafIndex).send({
          from: alice,
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  // --- mint_bridged wrong claimer ---

  it(
    "mint_bridged wrong claimer REVERT: bob cannot claim alice's bridge deposit",
    async () => {
      const salt = Fr.random();

      // Alice bridges from L1 with her claimer-bound secret.
      const { secret, claimAmount, leafIndex } = await bridgeForMintBridged(
        aztecNode,
        fpc.address,
        alice,
        salt,
        async () => {
          await deployCounter(wallet);
        },
        { loggerName: "test:bridged-wrong-claimer" },
      );

      // Claim FeeJuice on L2 (claim itself works — it credits FPC's public balance).
      const feeJuice = FeeJuiceContract.at(
        ProtocolContractAddress.FeeJuice,
        wallet,
      );
      await feeJuice.methods
        .claim(fpc.address, claimAmount, secret, leafIndex)
        .send({ from: alice });

      // Bob tries to call mint_bridged with the same (salt, leafIndex) but as msg_sender=bob.
      // Bob's reconstructed FeeJuice nullifier (using bob's address) doesn't match the one
      // that FeeJuice.claim emitted (which used alice's address), so the existence check fails.
      await expect(
        fpc.methods.mint_bridged(claimAmount, salt, leafIndex).send({
          from: bob,
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );
});
