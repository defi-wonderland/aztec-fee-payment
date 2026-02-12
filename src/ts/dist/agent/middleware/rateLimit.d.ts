import type { AgentConfig } from "../types/index.js";
/**
 * Create rate limiter middleware using express-rate-limit.
 * Key: req.ip (resolved via Express trust proxy setting).
 */
export declare function createRateLimiter(config: AgentConfig["rateLimit"]): import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=rateLimit.d.ts.map