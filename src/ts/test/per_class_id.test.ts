import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TxStatus } from "@aztec/aztec.js/tx";
import { Fr } from "@aztec/aztec.js/fields";
import { getContractClassFromArtifact } from "@aztec/stdlib/contract";
import { SchnorrAccountContractArtifact } from "@aztec/accounts/schnorr";

import { CounterContract, PerClassIdContract } from "../artifacts/index.js";
import { PerClassIdFeePaymentMethod } from "../fee-payment-methods/index.js";
import { deployPerClassIdContract } from "../utils/deploy.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
} from "./harness.js";

import {
  TEST_TIMEOUT,
  deployCounter,
  getGasSetup,
  getBalance,
} from "./utils.js";

describe("PerClassId Fee Payment Contract", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let fpc: PerClassIdContract;
  let paymentMethod: PerClassIdFeePaymentMethod;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-per-class-id", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    // Deploy counter for testing
    counter = await deployCounter(wallet);

    // Get SchnorrAccountContract class ID from artifact
    // The local test accounts use SchnorrAccountContract
    const contractClass = await getContractClassFromArtifact(
      SchnorrAccountContractArtifact,
    );
    const allowedClassId = new Fr(contractClass.id.toBigInt());

    // Deploy and fund the PerClassId FPC with the Schnorr account class ID
    fpc = await deployPerClassIdContract(wallet, allowedClassId);
    const { balance } = await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      fpc.address,
      {
        claimTxSender: alice,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "test:per-class-id",
      },
    );
    expect(balance).toBeGreaterThan(0n);

    paymentMethod = new PerClassIdFeePaymentMethod(fpc.address);
  });

  beforeEach(async () => {
    await counter.methods.reset().send({ from: alice });
  });

  it(
    "SUCCESS: sponsors transaction for allowed class ID",
    async () => {
      const balanceBefore = await getBalance(fpc.address, aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: { paymentMethod },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const balanceAfter = await getBalance(fpc.address, aztecNode);
      expect(balanceAfter).toBeLessThan(balanceBefore);
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(1n);
    },
    TEST_TIMEOUT,
  );

  it(
    "INVALID: reverts on private failure (tx not included)",
    async () => {
      await expect(
        counter.methods
          .revert_private()
          .send({
            from: alice,
            fee: { paymentMethod },
          })
          .wait(),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );

  it(
    "APP_LOGIC_REVERTED: fee payer still pays on public revert",
    async () => {
      const balanceBefore = await getBalance(fpc.address, aztecNode);
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      const receipt = await counter.methods
        .revert_public()
        .send({
          from: alice,
          fee: {
            paymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      const balanceAfter = await getBalance(fpc.address, aztecNode);
      expect(balanceAfter).toBeLessThan(balanceBefore);
      expect(
        await counter.methods.get_counter().simulate({ from: alice }),
      ).toBe(0n);
    },
    TEST_TIMEOUT,
  );
});
