import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { TxStatus } from "@aztec/aztec.js/tx";

import { deployCounter } from "./utils.js";

import { CounterContract } from "../artifacts/Counter.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
} from "./aztec_harness.js";

import { TEST_TIMEOUT } from "./test_utils/index.js";

describe("Fee Payment with No Sponsor", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-no-sponsor", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    counter = await deployCounter(wallet, alice);
  });

  beforeEach(async () => {
    await counter.methods.reset().send({ from: alice });
  });

  /**
   * Test no sponsor fee payment - SUCCESS case.
   * @expected_status SUCCESS
   * @effects Counter increments, alice pays protocol fees
   */
  it(
    "no_sponsor_fee: SUCCESS",
    async () => {
      const aliceFeeJuiceBefore = await getFeeJuiceBalance(alice, aztecNode);

      await counter.methods
        .increment()
        .send({
          from: alice, // pay directly (prior FeeJuice)
        })
        .wait();

      const aliceFeeJuiceAfter = await getFeeJuiceBalance(alice, aztecNode);
      expect(aliceFeeJuiceAfter).toBeLessThan(aliceFeeJuiceBefore);

      expect(
        await counter.methods.get_counter().simulate({
          from: alice,
        }),
      ).toBe(1n);
    },
    TEST_TIMEOUT,
  );

  /**
   * Test no sponsor fee payment - revert on public (app logic reverts in public function).
   * @expected_status APP_LOGIC_REVERTED
   * @effects App logic reverted, alice pays protocol fees
   */
  it(
    "no_sponsor_fee: APP_LOGIC_REVERTED (public app logic reverts)",
    async () => {
      const aliceFeeJuiceBefore = await getFeeJuiceBalance(alice, aztecNode);

      const receipt = await counter.methods
        .revert_public()
        .send({
          from: alice, // pay directly (prior FeeJuice)
        })
        .wait({ dontThrowOnRevert: true });

      expect(receipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

      const aliceFeeJuiceAfter = await getFeeJuiceBalance(alice, aztecNode);
      expect(aliceFeeJuiceAfter).toBeLessThan(aliceFeeJuiceBefore);
    },
    TEST_TIMEOUT,
  );
});
