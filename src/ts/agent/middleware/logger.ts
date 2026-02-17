import pino from "pino";
import type { AgentConfig } from "../types/index.js";

export type Logger = pino.Logger;

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
 * Create a pino logger configured per the agent spec.
 *
 * - JSON output in production, pretty-printed otherwise
 * - ISO timestamps
 * - Sensitive field redaction
 */
export function createAgentLogger(
  config: Pick<AgentConfig, "logLevel">,
): Logger {
  const isProduction = process.env.NODE_ENV === "production";

  return pino({
    level: config.logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: REDACT_PATHS,
    ...(isProduction
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
            },
          },
        }),
  });
}
