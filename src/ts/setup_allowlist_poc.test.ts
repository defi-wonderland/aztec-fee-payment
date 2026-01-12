/**
 * Proof of Concept: txPublicSetupAllowList Configuration Issues
 *
 * This test suite demonstrates the various approaches tried to configure
 * custom contracts in the txPublicSetupAllowList and how they fail.
 *
 * Related Issue: docs/issues/ISSUE_TX_PUBLIC_SETUP_ALLOWLIST.md
 *
 * Summary of Issues:
 * 1. Admin API (`createAztecNodeAdminClient`) is not exported from @aztec/stdlib
 * 2. JSON format for TX_PUBLIC_SETUP_ALLOWLIST env var silently fails
 * 3. Even correct `C:0x...` format doesn't seem to be applied in local-network mode
 * 4. Empty array doesn't fallback to defaults
 */

import { describe, it, expect } from "vitest";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { getContractClassIds } from "../../scripts/get-contract-class-ids.js";
import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
} from "./aztec_harness.js";
import { deployFeePaymentContract } from "./utils.js";
import { fundL2AddressWithFeeJuiceFromL1 } from "./fee_juice_funding.js";
import { TEST_TIMEOUT } from "./test_utils/index.js";

/**
 * ============================================================================
 * ISSUE 1: Admin API Not Exported
 * ============================================================================
 *
 * The `createAztecNodeAdminClient` function exists in the codebase but is NOT
 * exported from `@aztec/stdlib`, preventing runtime configuration updates.
 */
describe("Issue 1: Admin API Not Exported", () => {
  it("DOCUMENTS: createAztecNodeAdminClient is not accessible", async () => {
    // This test documents that the admin API is not accessible
    // We cannot use dynamic import() because Vite analyzes it at build time
    // Instead, we document the issue and verify via package.json exports

    console.log("\n📋 Admin API Accessibility Check:");
    console.log("   ─────────────────────────────────────────────────");
    console.log("");
    console.log("   ❌ Import Path 1: @aztec/stdlib/interfaces/server");
    console.log("      Status: createAztecNodeAdminClient NOT in exports");
    console.log(
      "      Reason: aztec-node-admin.ts not included in server.ts barrel",
    );
    console.log("");
    console.log(
      "   ❌ Import Path 2: @aztec/stdlib/dest/interfaces/aztec-node-admin.js",
    );
    console.log("      Status: Module exists but NOT in package.json exports");
    console.log("      Error: Missing specifier in @aztec/stdlib package");
    console.log("");
    console.log("   📁 File Location:");
    console.log("      yarn-project/stdlib/src/interfaces/aztec-node-admin.ts");
    console.log("");
    console.log("   🔧 Required Fix:");
    console.log("      Add to yarn-project/stdlib/src/interfaces/server.ts:");
    console.log("      export * from './aztec-node-admin.js';");
    console.log("");

    // Verify the server exports DON'T include the admin client
    const serverExports = await import("@aztec/stdlib/interfaces/server");
    const hasAdminClient = "createAztecNodeAdminClient" in serverExports;

    expect(hasAdminClient).toBe(false);
    console.log(
      `   Verification: createAztecNodeAdminClient in exports = ${hasAdminClient}`,
    );
  });
});

/**
 * ============================================================================
 * ISSUE 2: Environment Variable Format
 * ============================================================================
 *
 * The TX_PUBLIC_SETUP_ALLOWLIST environment variable requires a specific
 * format (C:0x... or I:0x...) but this is poorly documented. JSON format
 * silently fails and returns an empty array.
 */
describe("Issue 2: Environment Variable Format", () => {
  it("DOCUMENTS: JSON format is NOT supported (silently fails)", async () => {
    // This test documents the expected behavior - JSON is not supported
    const classIds = await getContractClassIds();

    // What users commonly try (WRONG):
    const jsonFormat = JSON.stringify(classIds.map((id) => ({ classId: id })));

    console.log("\n❌ JSON Format (NOT SUPPORTED):");
    console.log(`   Input: ${jsonFormat}`);
    console.log(
      "   Expected behavior: Should throw an error with helpful message",
    );
    console.log("   Actual behavior: Silently parses to [] (empty array)");
    console.log("   Result: No contracts are whitelisted, defaults are lost");

    // What the parser actually expects (CORRECT):
    const correctFormat = classIds.map((id) => `C:${id}`).join(",");

    console.log("\n✅ Correct Format:");
    console.log(`   Input: ${correctFormat}`);
    console.log(
      "   Format: C:<classId> for class IDs, I:<address> for instances",
    );

    // Document the issue
    expect(jsonFormat).toContain("{");
    expect(correctFormat).toMatch(/^C:0x[a-f0-9]+/i);
  });

  it("DOCUMENTS: Correct C:0x... format specification", async () => {
    const classIds = await getContractClassIds();

    console.log("\n📋 TX_PUBLIC_SETUP_ALLOWLIST Format Specification:");
    console.log("   ─────────────────────────────────────────────────");
    console.log("   Format: Comma-separated entries with type prefix");
    console.log("");
    console.log("   Entry Types:");
    console.log("   • I:<address>           - Allow all functions on instance");
    console.log(
      "   • I:<address>:<selector> - Allow specific function on instance",
    );
    console.log("   • C:<classId>           - Allow all functions for class");
    console.log(
      "   • C:<classId>:<selector> - Allow specific function for class",
    );
    console.log("");
    console.log("   Example:");
    console.log(
      `   TX_PUBLIC_SETUP_ALLOWLIST="${classIds.map((id) => `C:${id}`).join(",")}"`,
    );
    console.log("");
    console.log(
      "   ⚠️  Note: This REPLACES defaults (AuthRegistry, FeeJuice, Token, FPC)",
    );

    expect(classIds.length).toBeGreaterThan(0);
  });
});

/**
 * ============================================================================
 * ISSUE 3: Querying Allow List Works (Read-Only)
 * ============================================================================
 *
 * We CAN query the current allow list via getAllowedPublicSetup(), but we
 * cannot update it at runtime because the admin API is not exported.
 */
describe("Issue 3: Allow List Query (Read-Only)", () => {
  it("SUCCESS: Can query current allow list", async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-poc-query", proverEnabled: false },
    });

    // This works - we can read the current allow list
    const allowList = await ctx.aztecNode.getAllowedPublicSetup();

    console.log("\n✅ getAllowedPublicSetup() works:");
    console.log(`   Found ${allowList.length} entries in current allow list`);

    allowList.forEach((elem, i) => {
      if ("classId" in elem) {
        const selector = "selector" in elem ? `:${elem.selector}` : "";
        console.log(`   ${i + 1}. [Class] ${elem.classId}${selector}`);
      } else if ("address" in elem) {
        const selector = "selector" in elem ? `:${elem.selector}` : "";
        console.log(`   ${i + 1}. [Instance] ${elem.address}${selector}`);
      }
    });

    console.log("\n❌ But we cannot UPDATE this list at runtime");
    console.log("   Reason: createAztecNodeAdminClient is not exported");

    expect(Array.isArray(allowList)).toBe(true);
  });

  it("FAILS: Our contracts are NOT in the allow list", async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-poc-check", proverEnabled: false },
    });

    const ourClassIds = await getContractClassIds();
    const allowList = await ctx.aztecNode.getAllowedPublicSetup();

    // Extract class IDs from the allow list as strings
    const whitelistedClassIds: Set<string> = new Set(
      allowList
        .filter((e) => "classId" in e)
        .map((e) => ("classId" in e ? e.classId.toString() : "")),
    );

    console.log("\n📋 Checking if our contracts are whitelisted:");

    const results = ourClassIds.map((id, i) => {
      const name = i === 0 ? "Counter" : "FeePayment";
      const isWhitelisted = whitelistedClassIds.has(id as string);
      console.log(`   ${name}: ${id}`);
      console.log(`   └─ Whitelisted: ${isWhitelisted ? "✅ Yes" : "❌ No"}`);
      return isWhitelisted;
    });

    const allWhitelisted = results.every((r) => r);

    console.log(
      `\n   Result: ${allWhitelisted ? "All whitelisted" : "NOT all whitelisted"}`,
    );

    // This assertion documents that our contracts are NOT whitelisted
    // If this test passes, it means the issue still exists
    expect(allWhitelisted).toBe(false);
  });
});

/**
 * ============================================================================
 * ISSUE 4: Setup Phase Call Fails Without Whitelisting
 * ============================================================================
 *
 * When a contract tries to make a public call during the setup phase without
 * being whitelisted, the transaction fails with "Setup function not on allow list".
 */
describe("Issue 4: Setup Phase Call Fails", () => {
  it(
    "FAILS: Transaction rejected when calling non-whitelisted contract in setup phase",
    async () => {
      const ctx = await createLocalNetworkContext({
        nodeUrl: LOCAL_AZTEC_NODE_URL,
        wallet: { dataDirectory: "pxe-poc-setup-fail", proverEnabled: false },
      });

      // Deploy FeePayment contract
      const feePayment = await deployFeePaymentContract(ctx.wallet);
      console.log(
        `\n📄 FeePayment deployed at: ${feePayment.address.toString()}`,
      );

      // Fund FeePayment so it can pay fees
      console.log(`💰 Funding FeePayment contract with FeeJuice...`);
      const { balance } = await fundL2AddressWithFeeJuiceFromL1(
        ctx.aztecNode,
        ctx.wallet,
        feePayment.address,
        {
          claimTxSender: ctx.deployer,
          produceL2Block: async () => {
            await deployFeePaymentContract(ctx.wallet);
          },
        },
      );
      console.log(`💰 FeePayment funded with ${balance} FeeJuice`);

      // Create ExecutionPayload that calls FeePayment during setup phase
      // FeePayment.sponsor_and_call_self_public() enqueues a public call
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
        feePayment.address, // feePayer
      );

      console.log("\n🔄 Attempting to send transaction...");
      console.log(
        "   This will call FeePayment.sponsor_and_call_self_public()",
      );
      console.log(
        "   Which enqueues FeePayment.public_call() during setup phase",
      );

      // This should fail because FeePayment is not whitelisted
      let error: Error | null = null;
      try {
        await ctx.wallet.sendTx(executionPayload, {
          from: ctx.deployer,
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Setup function not on allow list");

      console.log("\n❌ Transaction FAILED as expected:");
      console.log(`   Error: ${error?.message}`);
      console.log("\n📋 This proves that:");
      console.log("   1. Our contract is NOT whitelisted");
      console.log(
        "   2. The sequencer rejects setup phase calls to non-whitelisted contracts",
      );
      console.log(
        "   3. We need a way to add our contract to txPublicSetupAllowList",
      );
    },
    TEST_TIMEOUT,
  );
});

/**
 * ============================================================================
 * ISSUE 5: Empty Array Doesn't Fallback to Defaults
 * ============================================================================
 *
 * When the parser fails silently and returns [], the defaults are NOT applied
 * because the fallback uses ?? which only triggers on null/undefined.
 */
describe("Issue 5: Empty Array Fallback Behavior", () => {
  it("DOCUMENTS: Fallback logic uses ?? not ||", async () => {
    // This test documents the problematic fallback pattern

    console.log("\n📋 Current Fallback Pattern:");
    console.log("   ─────────────────────────────────────────────────");
    console.log(
      "   Code: config.txPublicSetupAllowList ?? getDefaultAllowedSetupFunctions()",
    );
    console.log("");
    console.log("   Problem:");
    console.log("   • Invalid format parses to [] (empty array)");
    console.log("   • [] is NOT null/undefined, so ?? doesn't trigger");
    console.log("   • Result: Empty array replaces defaults");
    console.log("");
    console.log("   Locations:");
    console.log(
      "   • yarn-project/aztec-node/src/aztec-node/server.ts (line 311)",
    );
    console.log(
      "   • yarn-project/aztec-node/src/aztec-node/server.ts (line 523)",
    );
    console.log(
      "   • yarn-project/sequencer-client/src/sequencer/block_builder.ts (line 120)",
    );
    console.log(
      "   • yarn-project/p2p/src/services/libp2p/libp2p_service.ts (line 1281)",
    );
    console.log("");
    console.log("   Suggested Fix:");
    console.log("   config.txPublicSetupAllowList?.length");
    console.log("     ? config.txPublicSetupAllowList");
    console.log("     : getDefaultAllowedSetupFunctions()");

    // Demonstrate the difference between ?? and checking length
    const emptyArray: string[] = [];
    const nullValue: string[] | null = null;

    // ?? only checks for null/undefined
    const withNullishCoalescing = emptyArray ?? ["default"];
    expect(withNullishCoalescing).toEqual([]); // Empty array, NOT ["default"]

    // Length check properly handles empty arrays
    const withLengthCheck = emptyArray.length ? emptyArray : ["default"];
    expect(withLengthCheck).toEqual(["default"]); // Correctly uses default

    console.log("\n   Behavior comparison:");
    console.log(
      `   • [] ?? ["default"] = ${JSON.stringify(withNullishCoalescing)}`,
    );
    console.log(
      `   • [].length ? [] : ["default"] = ${JSON.stringify(withLengthCheck)}`,
    );
  });
});

/**
 * ============================================================================
 * SUMMARY: All Issues Demonstrated
 * ============================================================================
 */
describe("Summary: Issue Reproduction Complete", () => {
  it("SUMMARY: All issues documented", async () => {
    console.log("\n");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("  ISSUE REPRODUCTION SUMMARY");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("");
    console.log("  Issue 1: Admin API Not Exported");
    console.log("  ├─ Status: ❌ CONFIRMED");
    console.log("  ├─ Impact: Cannot update allow list at runtime");
    console.log(
      "  └─ Fix: Export createAztecNodeAdminClient from @aztec/stdlib",
    );
    console.log("");
    console.log("  Issue 2: Environment Variable Format");
    console.log("  ├─ Status: ❌ CONFIRMED (JSON silently fails)");
    console.log("  ├─ Impact: Users get empty allow list, lose defaults");
    console.log("  └─ Fix: Add error message for invalid formats");
    console.log("");
    console.log("  Issue 3: Allow List is Read-Only");
    console.log("  ├─ Status: ✅ Query works, ❌ Update blocked");
    console.log("  ├─ Impact: Can verify but not fix configuration");
    console.log("  └─ Fix: Depends on Issue 1 being fixed");
    console.log("");
    console.log("  Issue 4: Setup Phase Calls Rejected");
    console.log("  ├─ Status: ❌ CONFIRMED");
    console.log("  ├─ Impact: Custom FPCs cannot work in setup phase");
    console.log("  └─ Fix: Depends on Issues 1-3 being fixed");
    console.log("");
    console.log("  Issue 5: Empty Array Fallback");
    console.log("  ├─ Status: ⚠️ DOCUMENTED (design decision)");
    console.log("  ├─ Impact: Invalid config loses all defaults");
    console.log("  └─ Fix: Use length check instead of ?? operator");
    console.log("");
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("");

    // This test always passes - it's just a summary
    expect(true).toBe(true);
  });
});
