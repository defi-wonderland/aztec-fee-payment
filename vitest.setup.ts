import { checkAztecVersion } from "./scripts/check-aztec-version.js";
import { getContractClassIds } from "./scripts/get-contract-class-ids.js";
import { startSandbox } from "./scripts/start-sandbox.js";

/**
 * Vitest global setup - runs before all tests
 * Returns a teardown function that runs after all tests
 */
export async function setup() {
  console.log("\n🔧 Setting up Aztec testing environment\n");

  let sandboxManager: any;

  try {
    // Step 1: Check Aztec CLI version
    console.log("Step 1: Checking Aztec CLI version compatibility");
    await checkAztecVersion();
    console.log("");

    // Step 2: Compute our contract class IDs for whitelisting
    console.log("Step 2: Computing contract class IDs for setup whitelist");
    const contractClassIds = await getContractClassIds();
    console.log(`   Found ${contractClassIds.length} contract class ID(s):`);
    contractClassIds.forEach((id) => console.log(`   - ${id}`));
    console.log("");

    // Step 3: Start sandbox with our contracts in the whitelist
    // Note: This sets TX_PUBLIC_SETUP_ALLOWLIST env var which REPLACES defaults
    console.log("Step 3: Starting Aztec sandbox with custom whitelist");
    sandboxManager = await startSandbox({
      verbose: true,
      allowedSetupContractClassIds: contractClassIds,
    });
    console.log("");

    // Step 4: Verify the allow list is configured correctly
    console.log("Step 4: Verifying txPublicSetupAllowList configuration");
    const allowListStatus =
      await sandboxManager.checkAllowList(contractClassIds);
    if (!allowListStatus.allWhitelisted) {
      console.warn(`⚠️  Not all contracts are whitelisted!`);
      console.warn(`   Missing: ${allowListStatus.missingClassIds.join(", ")}`);
    }
    console.log("");

    // Store sandbox manager globally for teardown
    globalThis.__AZTEC_SANDBOX_MANAGER__ = sandboxManager;
  } catch (error: any) {
    console.error(`\n❌ Setup failed: ${error.message}`);
    process.exit(1);
  }

  // Return teardown function
  return async () => {
    console.log("\nLast Step: Cleaning up Aztec testing environment");

    try {
      if (sandboxManager) {
        await sandboxManager.stop();
        console.log("✅ Sandbox stopped successfully");
      } else {
        console.log("ℹ️  No sandbox manager found, skipping cleanup");
      }

      console.log("✅ Aztec testing environment cleanup complete\n");
    } catch (error: any) {
      console.error("⚠️  Error during cleanup:", error.message);
      // Don't exit with error code during cleanup, just log the issue
    }
  };
}
