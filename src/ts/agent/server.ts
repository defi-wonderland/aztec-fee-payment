import express from "express";
import cors from "cors";
import type { AgentConfig } from "./types/index.js";
import {
  createAgentLogger,
  createErrorHandler,
  createRateLimiter,
} from "./middleware/index.js";
import { MultiChainEVMClient } from "./services/evm/client.js";
import { SecretGenerator } from "./services/crypto/secret.js";
import { AuthwitGenerator } from "./services/crypto/authwit.js";
import { createAuthwitRouter } from "./routes/authwit.js";

export function createServer(config: AgentConfig) {
  const logger = createAgentLogger(config);
  const app = express();
  app.set("trust proxy", true);

  // Body parsing
  app.use(express.json());

  // CORS: all origins, GET/POST/OPTIONS
  app.use(cors({ origin: true }));

  // Request ID
  app.use((req, _res, next) => {
    if (!req.headers["x-request-id"]) {
      req.headers["x-request-id"] = crypto.randomUUID();
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
          requestId: req.headers["x-request-id"],
        },
        "Request completed",
      );
    });
    next();
  });

  // Rate limiting
  app.use("/api/", createRateLimiter(config.rateLimit));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "1.0.0",
      chains: Object.keys(config.chains).map(Number),
    });
  });

  // Services
  const evmClients = new MultiChainEVMClient(config.chains, logger);
  const secretGenerator = new SecretGenerator(config.spSigningKey);
  const authwitGenerator = new AuthwitGenerator({
    fpcAddress: config.aztec.fpcAddress,
    ownerAddress: config.aztec.ownerAddress,
    ownerSigningKey: config.spSigningKey,
  });

  // API routes
  const authwitRouter = createAuthwitRouter({
    config,
    evmClients,
    secretGenerator,
    authwitGenerator,
    logger,
  });
  app.use("/api/v1", authwitRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      error: "INVALID_REQUEST",
      message: "Route not found",
    });
  });

  // Error handler (must be last)
  app.use(createErrorHandler(logger));

  return { app, logger };
}
