import { describe, it, expect } from "vitest";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { getContractClassIds } from "../../scripts/get-contract-class-ids.js";
import { fundL2AddressWithFeeJuiceFromL1 } from "./fee_juice_funding.js";
import { deployFeePaymentContract } from "./utils.js";
import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
} from "./aztec_harness.js";
import { TEST_TIMEOUT } from "./test_utils/index.js";

/**
 * Test suite demonstrating setup phase whitelisting for PUBLIC function calls.
 *
 * The `txPublicSetupAllowList` configuration allows specific contract classes
 * to have their PUBLIC functions called during the transaction setup phase.
 *
 * How it works:
 * - During setup phase, contracts can enqueue PUBLIC functions of whitelisted contracts
 * - Only whitelisted contract classes can be called during this phase
 * - This is enforced by the sequencer when processing transactions
 *
 * Test approach:
 * - FeePayment.sponsor_and_call_self_public() enqueues FeePayment.public_call() PUBLIC function during setup
 * - With FeePayment whitelisted (configured in vitest.setup.ts): Call succeeds, transaction completes
 *
 * Note: The sandbox is started with our contracts whitelisted via vitest.setup.ts.
 * Testing the negative case (non-whitelisted) requires a separate test run with different config.
 */
describe("Setup Phase Whitelist - Public Function Calls", () => {
  /**
   * SUCCESS: FeePayment's PUBLIC function can be called during setup phase when whitelisted.
   *
   * This test demonstrates:
   * 1. FeePayment.sponsor_and_call_self_public() is called during setup phase (via ExecutionPayload)
   * 2. Inside that function, FeePayment enqueues its own PUBLIC function public_call() using self.enqueue_self.public_call()
   * 3. With FeePayment whitelisted: The PUBLIC call succeeds
   * 4. FeePayment ends setup and pays fees
   * 5. Transaction completes successfully
   *
   * IMPORTANT: The sandbox must be started with FeePayment's class ID in txPublicSetupAllowList.
   * This is configured in vitest.setup.ts which passes our contract class IDs at startup.
   */
  it(
    "SUCCESS: FeePayment's PUBLIC function called during setup phase when whitelisted",
    async () => {
      // Get our contract class IDs to verify they're whitelisted
      const contractClassIds = await getContractClassIds();
      expect(contractClassIds.length).toBeGreaterThan(0);
      console.log(`\n📋 Our contract class IDs:`);
      contractClassIds.forEach((id, i) => console.log(`   ${i + 1}. ${id}`));

      // Use the sandbox that was started with our contracts whitelisted (by vitest.setup.ts)
      const ctx = await createLocalNetworkContext({
        nodeUrl: LOCAL_AZTEC_NODE_URL,
        wallet: {
          dataDirectory: "pxe-test-setup-success",
          proverEnabled: false,
        },
      });

      // Query current allowed setup functions to verify our contracts are whitelisted
      const allowedSetup = await ctx.aztecNode.getAllowedPublicSetup();
      console.log(
        `\n📋 Current allowed public setup functions (${allowedSetup.length} entries):`,
      );
      allowedSetup.forEach((elem, i) => {
        if ("classId" in elem) {
          console.log(`   ${i + 1}. classId: ${elem.classId.toString()}`);
        } else if ("address" in elem) {
          console.log(`   ${i + 1}. address: ${elem.address.toString()}`);
        }
      });

      // Verify our FeePayment class ID is in the whitelist
      // The vitest.setup.ts should have called updateAllowList() to add our contracts
      const feePaymentClassId = contractClassIds[1]; // FeePayment is second
      const isWhitelisted = allowedSetup.some(
        (elem) =>
          "classId" in elem && elem.classId.toString() === feePaymentClassId,
      );
      console.log(
        `\n🔍 FeePayment (${feePaymentClassId}) whitelisted: ${isWhitelisted}`,
      );
      expect(isWhitelisted).toBe(true);

      // Deploy FeePayment contract
      const feePayment = await deployFeePaymentContract(ctx.wallet);
      console.log(
        `\n📄 FeePayment deployed at: ${feePayment.address.toString()}`,
      );

      // Fund FeePayment so it can pay fees
      console.log(`\n💰 Funding FeePayment contract with FeeJuice...`);
      const { balance } = await fundL2AddressWithFeeJuiceFromL1(
        ctx.aztecNode,
        ctx.wallet,
        feePayment.address,
        {
          claimTxSender: ctx.deployer,
          produceL2Block: async () => {
            // Produce L2 blocks by sending any tx
            await deployFeePaymentContract(ctx.wallet);
          },
        },
      );
      console.log(`💰 FeePayment funded with ${balance} FeeJuice`);

      // Create ExecutionPayload that calls FeePayment during setup phase
      // FeePayment.sponsor_and_call_self_public() will internally enqueue FeePayment.public_call() PUBLIC function
      const executionPayload = new ExecutionPayload(
        [
          {
            name: "sponsor_and_call_self_public",
            to: feePayment.address,
            selector: await FunctionSelector.fromSignature(
              "sponsor_and_call_self_public()",
            ),
            type: FunctionType.PRIVATE,
            hideMsgSender: false,
            isStatic: false,
            args: [],
            returnTypes: [],
          },
        ],
        [], // app logic functions
        [], // teardown functions
        [],
        feePayment.address, // feePayer - FeePayment sets itself as fee payer
      );

      // This succeeds because FeePayment is whitelisted
      // FeePayment enqueues its own PUBLIC function public_call() during setup phase
      await ctx.wallet.sendTx(executionPayload, {
        from: ctx.deployer,
      });

      console.log(
        "\n✅ FeePayment.public_call() PUBLIC function called during SETUP PHASE (whitelisted)\n   Transaction completed successfully, proving the call succeeded\n",
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * Verification: Contract class IDs are computed correctly.
   */
  it("should compute contract class IDs correctly", async () => {
    const contractClassIds = await getContractClassIds();

    expect(contractClassIds.length).toBe(2); // Counter and FeePayment

    contractClassIds.forEach((id) => {
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    console.log("\n📋 Computed contract class IDs:");
    contractClassIds.forEach((id, index) => {
      const name = index === 0 ? "Counter" : "FeePayment";
      console.log(`   ${name}: ${id}`);
    });
  });
});
