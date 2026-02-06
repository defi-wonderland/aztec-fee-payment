import rateLimit from "express-rate-limit";
import type { AgentConfig, ErrorResponse } from "../types/index.js";

/**
 * Create rate limiter middleware using express-rate-limit.
 * Key: X-Forwarded-For header (for proxied requests) or request IP.
 */
export function createRateLimiter(config: AgentConfig["rateLimit"]) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const forwarded = req.headers["x-forwarded-for"];
      if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
      return req.ip ?? "unknown";
    },
    handler: (_req, res) => {
      res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many requests, please try again later",
      } satisfies ErrorResponse);
    },
  });
}
