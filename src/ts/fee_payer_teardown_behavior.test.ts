import { describe, it, expect, beforeAll } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TxStatus } from "@aztec/aztec.js/tx";
import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { ExecutionPayload } from "@aztec/stdlib/tx";

import { deployCounter, deployFeePaymentContract } from "./utils.js";
import { CounterContract } from "../artifacts/Counter.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";
import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  deployAndFundFeePayer,
} from "./aztec_harness.js";
import { TEST_TIMEOUT } from "./test_utils/index.js";

describe("Fee Payer and Teardown Behavior", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counterA: CounterContract;
  let counterB: CounterContract;
  let feePaymentContract: FeePaymentContract;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-fee-teardown", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    // Deploy two Counter instances for cross-contract tests
    counterA = await deployCounter(wallet, alice);
    counterB = await deployCounter(wallet, alice);

    // Deploy and fund FeePaymentContract for sponsorship tests
    const { feePaymentContract: deployedFeePayer } =
      await deployAndFundFeePayer({
        aztecNode,
        wallet,
        claimTxSender: alice,
        produceL2Block: async () => {
          // Produce L2 blocks by sending any tx
          await deployCounter(wallet, alice);
        },
        loggerName: "test:fee-teardown",
      });
    feePaymentContract = deployedFeePayer;
  });

  /**
   * Test hypothesis 1: Contract A calls set_as_fee_payer, then Contract B calls it → should revert
   * @expected_status Should revert during simulation or execution
   */
  it(
    "set_as_fee_payer: second contract call should revert",
    async () => {
      const executionPayload = new ExecutionPayload(
        [
          {
            name: "call_set_as_fee_payer",
            to: counterA.address,
            selector: await FunctionSelector.fromSignature(
              "call_set_as_fee_payer()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
          {
            name: "call_set_as_fee_payer",
            to: counterB.address,
            selector: await FunctionSelector.fromSignature(
              "call_set_as_fee_payer()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
        ],
        [],
        [],
        [],
        undefined, // feePayer - will be set by first contract
      );

      // The transaction should fail because the second contract tries to set fee payer
      // after the first one already did (or because end_setup() is called twice)
      await expect(
        wallet.sendTx(executionPayload, { from: alice }),
      ).rejects.toThrow(/Cannot overwrite non-empty fee_payer/);
    },
    TEST_TIMEOUT,
  );

  /**
   * Test hypothesis 2: Contract A calls set_as_teardown, then Contract B calls it → should revert
   * @expected_status Should revert during simulation or execution
   */
  it(
    "set_as_teardown: second contract call should revert",
    async () => {
      const executionPayload = new ExecutionPayload(
        [
          {
            name: "call_set_as_teardown_noop",
            to: counterA.address,
            selector: await FunctionSelector.fromSignature(
              "call_set_as_teardown_noop()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
          {
            name: "call_set_as_teardown_noop",
            to: counterB.address,
            selector: await FunctionSelector.fromSignature(
              "call_set_as_teardown_noop()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
        ],
        [],
        [],
        [],
        undefined, // feePayer - will be set by contracts
      );

      // The transaction should fail because the second contract tries to set teardown
      // after the first one already did (cannot enter revertible phase twice)
      await expect(
        wallet.sendTx(executionPayload, { from: alice }),
      ).rejects.toThrow(/Public teardown call request already set/);
    },
    TEST_TIMEOUT,
  );

  /**
   * Test case: FeePaymentContract sponsors (sets fee payer), then Counter calls set_as_fee_payer → should revert
   * @expected_status Should revert because fee payer is already set
   */
  it(
    "FeePaymentContract sponsors then Counter calls set_as_fee_payer should revert",
    async () => {
      const executionPayload = new ExecutionPayload(
        [
          {
            name: "sponsor_unconditionally",
            to: feePaymentContract.address,
            selector: await FunctionSelector.fromSignature(
              "sponsor_unconditionally()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
          {
            name: "call_set_as_fee_payer",
            to: counterA.address,
            selector: await FunctionSelector.fromSignature(
              "call_set_as_fee_payer()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
        ],
        [],
        [],
        [],
        feePaymentContract.address, // feePayer - set by FeePaymentContract
      );

      // The transaction should fail because Counter tries to set fee payer
      // after FeePaymentContract already did
      await expect(
        wallet.sendTx(executionPayload, { from: alice }),
      ).rejects.toThrow(/Cannot overwrite non-empty fee_payer/);
    },
    TEST_TIMEOUT,
  );

  /**
   * Test case: FeePaymentContract sets teardown, then Counter calls set_as_teardown_noop → should revert
   * @expected_status Should revert because teardown is already set (cannot enter revertible phase twice)
   */
  it(
    "FeePaymentContract with teardown then Counter calls set_as_teardown_noop should revert",
    async () => {
      const executionPayload = new ExecutionPayload(
        [
          {
            name: "sponsor_unconditionally_teardown_revert",
            to: feePaymentContract.address,
            selector: await FunctionSelector.fromSignature(
              "sponsor_unconditionally_teardown_revert()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
          {
            name: "call_set_as_teardown_noop",
            to: counterA.address,
            selector: await FunctionSelector.fromSignature(
              "call_set_as_teardown_noop()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
        ],
        [],
        [],
        [],
        feePaymentContract.address, // feePayer - set by FeePaymentContract
      );

      // The transaction should fail because Counter tries to set teardown
      // after FeePaymentContract already did (cannot enter revertible phase twice)
      await expect(
        wallet.sendTx(executionPayload, { from: alice }),
      ).rejects.toThrow(/Public teardown call request already set/);
    },
    TEST_TIMEOUT,
  );

  /**
   * Test case: Contract A calls end_setup, then Contract B calls it → should revert
   * @expected_status Should revert because end_setup can only be called once
   */
  it(
    "end_setup: second contract call should revert",
    async () => {
      const executionPayload = new ExecutionPayload(
        [
          {
            name: "call_end_setup",
            to: counterA.address,
            selector: await FunctionSelector.fromSignature("call_end_setup()"),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
          {
            name: "call_end_setup",
            to: counterB.address,
            selector: await FunctionSelector.fromSignature("call_end_setup()"),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
        ],
        [],
        [],
        [],
        undefined, // feePayer - will be set if needed
      );

      // The transaction should fail because the second contract tries to call end_setup
      // after the first one already did
      await expect(
        wallet.sendTx(executionPayload, { from: alice }),
      ).rejects.toThrow(/Cannot enter the revertible phase twice/);
    },
    TEST_TIMEOUT,
  );
});
