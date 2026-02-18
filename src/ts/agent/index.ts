// Off-Chain Agent — Main entry point

import { loadConfig } from "./config/index.js";
import { createServer } from "./server.js";

// Re-exports for library usage
export { loadConfig } from "./config/index.js";
export { createServer } from "./server.js";
export {
  createAgentLogger,
  createErrorHandler,
  createValidationMiddleware,
  createRateLimiter,
} from "./middleware/index.js";
export {
  AppError,
  invalidInput,
  notFound,
  rateLimited,
  internal,
} from "./errors.js";
export { MultiChainEVMClient } from "./services/evm/index.js";
export {
  SecretGenerator,
  AuthwitGenerator,
  formatAuthwitResponse,
} from "./services/crypto/index.js";
export type {
  ISecretGenerator,
  IAuthwitGenerator,
} from "./services/crypto/index.js";
export type {
  AgentConfig,
  AuthwitRequestBody,
  AuthwitResponse,
  ErrorResponse,
  ErrorCode,
} from "./types/index.js";
export { authwitRequestSchema, configSchema } from "./types/index.js";

// Start server when run directly
const isMainModule =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMainModule) {
  const config = loadConfig();
  const { app, logger } = createServer(config);

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, host: config.host },
      "Agent server started",
    );
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
