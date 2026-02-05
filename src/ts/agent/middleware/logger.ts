/**
 * Structured logging with pino
 *
 * Features:
 * - JSON logging for production
 * - Pretty printing for development
 * - Request ID propagation
 * - Sensitive data redaction
 */

import pino from "pino";
import type { AgentConfig } from "../types/index.js";

// Paths to redact from logs
const REDACT_PATHS = [
  "spSigningKey",
  "req.headers.authorization",
  "req.body.signature",
  "secret",
  "witness",
  "privateKey",
  "signingKey",
];

/**
 * Create a pino logger instance
 */
export function createLogger(config: Pick<AgentConfig, "logLevel">) {
  const isDev = process.env.NODE_ENV !== "production";

  return pino({
    level: config.logLevel,
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDev && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    }),
  });
}

export type Logger = pino.Logger;
