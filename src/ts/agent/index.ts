/**
 * FPC Off-Chain Agent
 *
 * A stateless, privacy-preserving API service that enables users to claim
 * wFJ (wrapped Fee Juice) on Aztec after paying on EVM chains.
 *
 * Usage:
 *   yarn agent:start    # Start the server
 *   yarn agent:dev      # Start with hot reload
 *
 * Environment Variables:
 *   SP_SIGNING_KEY     - 32-byte hex private key for secret generation
 *   FPC_ADDRESS        - Aztec FPC contract address
 *   OWNER_ADDRESS      - Aztec owner account address
 *   PORT               - Server port (default: 3000)
 *   HOST               - Server host (default: 0.0.0.0)
 *   LOG_LEVEL          - Log level (debug, info, warn, error)
 *
 * Chain Configuration:
 *   CHAIN_{ID}_RPC_URL         - RPC URL for chain
 *   CHAIN_{ID}_FEE_COLLECTOR   - Fee collector address
 *   CHAIN_{ID}_CONFIRMATIONS   - Required confirmations (optional)
 */

import { loadConfig, validateEnvironment } from "./config/index.js";
import { createServer, startServer } from "./server.js";

async function main() {
  // Validate environment variables
  const envErrors = validateEnvironment();
  if (envErrors.length > 0) {
    console.error("Environment validation failed:");
    envErrors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  // Load and validate configuration
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error("Configuration error:", (error as Error).message);
    process.exit(1);
  }

  // Create and start server
  const { app, logger } = await createServer(config);
  await startServer(app, config, logger);
}

// Run if this is the main module
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Export for testing
export { loadConfig, validateEnvironment } from "./config/index.js";
export { createServer, startServer } from "./server.js";
export * from "./types/index.js";
export * from "./services/evm/index.js";
export * from "./services/crypto/index.js";
export * from "./middleware/index.js";
