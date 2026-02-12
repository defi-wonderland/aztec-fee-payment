import pino from "pino";
import type { AgentConfig } from "../types/index.js";
export type Logger = pino.Logger;
/**
 * Create a pino logger configured per the agent spec.
 *
 * - JSON output in production, pretty-printed otherwise
 * - ISO timestamps
 * - Sensitive field redaction
 */
export declare function createAgentLogger(config: Pick<AgentConfig, "logLevel">): Logger;
//# sourceMappingURL=logger.d.ts.map