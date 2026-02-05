/**
 * HTTP Server Setup
 *
 * Configures and starts the Fastify server with all routes and middleware.
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { AgentConfig } from "./types/index.js";
import { createLogger, type Logger } from "./middleware/logger.js";
import {
  createErrorHandler,
  createNotFoundHandler,
} from "./middleware/errorHandler.js";
import { registerRateLimit } from "./middleware/rateLimit.js";
import { registerAuthwitRoutes } from "./routes/authwit.js";
import { MultiChainEVMClient } from "./services/evm/index.js";
import { SecretGenerator } from "./services/crypto/secret.js";
import { AuthwitGenerator } from "./services/crypto/authwit.js";

/**
 * Create and configure the Fastify server
 */
export async function createServer(config: AgentConfig): Promise<{
  app: FastifyInstance;
  logger: Logger;
}> {
  // Create logger
  const logger = createLogger(config);
  logger.info("Creating server...");

  // Create Fastify instance
  const app = Fastify({
    logger: false, // We use our own logger
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  // Register CORS
  await app.register(cors, {
    origin: true, // Allow all origins in development, configure in production
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  });

  // Register rate limiting
  await registerRateLimit(app, config.rateLimit);

  // Set up error handling
  app.setErrorHandler(createErrorHandler(logger));
  app.setNotFoundHandler(createNotFoundHandler());

  // Request logging
  app.addHook("onRequest", async (request) => {
    logger.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        ip: request.ip,
      },
      "Incoming request",
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    logger.info(
      {
        requestId: request.id,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "Request completed",
    );
  });

  // Health check endpoint
  app.get("/health", async () => ({
    status: "ok",
    version: "1.0.0",
    chains: Object.keys(config.chains).map(Number),
  }));

  // Initialize services
  const evmClients = new MultiChainEVMClient(config.chains, logger);
  const secretGenerator = new SecretGenerator(config.spSigningKey);
  const authwitGenerator = new AuthwitGenerator({
    fpcAddress: config.aztec.fpcAddress,
    ownerAddress: config.aztec.ownerAddress,
    ownerSigningKey: config.spSigningKey, // Using same key for simplicity
  });

  // Register API routes
  await app.register(
    async (apiApp) => {
      await registerAuthwitRoutes(apiApp, {
        config,
        logger,
        evmClients,
        secretGenerator,
        authwitGenerator,
      });
    },
    { prefix: "/api/v1" },
  );

  logger.info("Server configured successfully");

  return { app, logger };
}

/**
 * Start the server
 */
export async function startServer(
  app: FastifyInstance,
  config: Pick<AgentConfig, "host" | "port">,
  logger: Logger,
): Promise<void> {
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down server...");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Start listening
  await app.listen({
    host: config.host,
    port: config.port,
  });

  logger.info(
    { host: config.host, port: config.port },
    "Server started and listening",
  );
}
