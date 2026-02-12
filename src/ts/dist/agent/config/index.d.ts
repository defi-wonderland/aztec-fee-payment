import "dotenv/config";
import { type AgentConfig } from "../types/index.js";
/**
 * Load and validate agent configuration from environment variables.
 *
 * Required env vars: SP_SIGNING_KEY, FPC_ADDRESS, OWNER_ADDRESS, plus at
 * least one CHAIN_<id>_* group.
 */
export declare function loadConfig(env?: Record<string, string | undefined>): AgentConfig;
//# sourceMappingURL=index.d.ts.map