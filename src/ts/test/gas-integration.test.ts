import { describe, it, expect, beforeAll } from "vitest";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Fr } from "@aztec/aztec.js/fields";
import { GasFees, GasSettings } from "@aztec/stdlib/gas";
import { FeeJuiceContract } from "@aztec/noir-contracts.js/FeeJuice";
import { ProtocolContractAddress } from "@aztec/protocol-contracts";

import { BridgedFPCContract } from "../../artifacts/BridgedFPC.js";
import { CounterContract } from "../../artifacts/Counter.js";
import { FPCFeePaymentMethod } from "../fee-payment-methods/index.js";
import { registerBridgedContract } from "../utils/deploy.js";
import {
  maxGasCostFor,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../utils/gas.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
  bridgeForMint,
} from "./harness.js";

import {
  TEST_TIMEOUT,
  deployCounter,
  getGasSetup,
  getBalance,
} from "./utils.js";

describe("Gas calculation integration — BridgedFPC pay_fee", () => {
  let wallet: EmbeddedWallet;
  let alice: AztecAddress;
  let aztecNode: AztecNode;
  let fpc: BridgedFPCContract;
  let paymentMethod: FPCFeePaymentMethod;
  let counter: CounterContract;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: {
        dataDirectory: "pxe-test-gas-integration",
        proverEnabled: false,
      },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    // Register BridgedFPC (no deployment tx — fully private contract).
    fpc = await registerBridgedContract(wallet);

    // Fund FPC's public FeeJuice balance so it can pay sequencers.
    const { balance } = await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      fpc.address,
      {
        claimTxSender: alice,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "test:gas-integration-fund",
      },
    );
    expect(balance).toBeGreaterThan(0n);

    // Bridge + claim + mint to give alice a wFJ internal balance.
    const salt = Fr.random();
    const { secret, claimAmount, leafIndex } = await bridgeForMint(
      aztecNode,
      fpc.address,
      alice,
      salt,
      async () => {
        await deployCounter(wallet);
      },
      { loggerName: "test:gas-integration-bridge" },
    );

    const feeJuice = FeeJuiceContract.at(
      ProtocolContractAddress.FeeJuice,
      wallet,
    );
    await feeJuice.methods
      .claim(fpc.address, claimAmount, secret, leafIndex)
      .send({ from: alice });

    await fpc.methods.mint(claimAmount, salt, leafIndex).send({ from: alice });

    paymentMethod = new FPCFeePaymentMethod(fpc.address);
    counter = await deployCounter(wallet);
  }, TEST_TIMEOUT);

  it(
    "actual transactionFee <= maxGasCostFor (our formula is a valid upper bound)",
    async () => {
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
      expect(receipt.transactionFee).toBeDefined();
      expect(receipt.transactionFee!).toBeGreaterThan(0n);
      expect(receipt.transactionFee!).toBeLessThanOrEqual(maxGasCost);
    },
    TEST_TIMEOUT,
  );

  it(
    "maxGasCostFor matches GasSettings.getFeeLimit() with real node base fees",
    async () => {
      const { maxFeesPerGas, gasLimits } = await getGasSetup(aztecNode);

      // Construct GasSettings with non-zero teardown to prove it doesn't affect getFeeLimit.
      const settings = GasSettings.from({
        gasLimits,
        teardownGasLimits: REASONABLE_TEARDOWN_GAS_LIMITS,
        maxFeesPerGas,
        maxPriorityFeesPerGas: GasFees.empty(),
      });

      expect(maxGasCostFor(maxFeesPerGas, gasLimits)).toBe(
        settings.getFeeLimit().toBigInt(),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "Noir get_max_gas_cost matches TS maxGasCostFor (FPC balance deduction == computed maxGasCost)",
    async () => {
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

      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      // The Noir circuit's get_max_gas_cost deducted exactly maxGasCost from alice's balance.
      // This proves: Noir formula === TS formula.
      const deduction = internalBalanceBefore - internalBalanceAfter;
      expect(deduction).toBe(maxGasCost);

      // And the protocol's canonical formula agrees.
      const settings = GasSettings.from({
        gasLimits,
        teardownGasLimits: REASONABLE_TEARDOWN_GAS_LIMITS,
        maxFeesPerGas,
        maxPriorityFeesPerGas: GasFees.empty(),
      });
      expect(deduction).toBe(settings.getFeeLimit().toBigInt());

      // The old double-counted formula would have deducted more.
      const doubleCountedCost =
        BigInt(maxFeesPerGas.feePerDaGas) *
          (BigInt(gasLimits.daGas) +
            BigInt(REASONABLE_TEARDOWN_GAS_LIMITS.daGas)) +
        BigInt(maxFeesPerGas.feePerL2Gas) *
          (BigInt(gasLimits.l2Gas) +
            BigInt(REASONABLE_TEARDOWN_GAS_LIMITS.l2Gas));

      expect(deduction).toBeLessThan(doubleCountedCost);
    },
    TEST_TIMEOUT,
  );
});
