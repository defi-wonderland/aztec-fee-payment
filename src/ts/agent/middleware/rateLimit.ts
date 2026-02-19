import rateLimit from "express-rate-limit";
import type { AgentConfig, ErrorResponse } from "../types/index.js";

/**
 * Create rate limiter middleware using express-rate-limit.
 * Key: req.ip (resolved via Express trust proxy setting).
 */
export function createRateLimiter(config: AgentConfig["rateLimit"]) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? "unknown",
    handler: (_req, res) => {
      res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many requests, please try again later",
      } satisfies ErrorResponse);
    },
  });
}
