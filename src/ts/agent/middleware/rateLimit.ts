/**
 * Rate Limiting Configuration
 *
 * Configures rate limiting for the Fastify server using @fastify/rate-limit.
 */

import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { RateLimitConfig } from "../types/index.js";

/**
 * Register rate limiting plugin
 */
export async function registerRateLimit(
  app: FastifyInstance,
  config: RateLimitConfig,
) {
  await app.register(rateLimit, {
    max: config.maxRequests,
    timeWindow: config.windowMs,
    // Use IP address as the key
    keyGenerator: (request) => {
      // Support X-Forwarded-For header for proxied requests
      const forwarded = request.headers["x-forwarded-for"];
      if (forwarded) {
        const ip = Array.isArray(forwarded)
          ? forwarded[0]
          : forwarded.split(",")[0];
        return ip?.trim() || request.ip;
      }
      return request.ip;
    },
    // Custom error response
    errorResponseBuilder: (_request, context) => ({
      error: "RATE_LIMITED",
      message: `Rate limit exceeded. Try again in ${Math.ceil((context.after.replace("ms", "") as unknown as number) / 1000)} seconds`,
      details: {
        retryAfter: context.after,
      },
    }),
    // Add headers to response
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  });
}
