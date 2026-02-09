import { Router } from "express";
import { type AgentConfig } from "../types/index.js";
import { MultiChainEVMClient } from "../services/evm/client.js";
import { SecretGenerator } from "../services/crypto/secret.js";
import { AuthwitGenerator } from "../services/crypto/authwit.js";
import type { Logger } from "../middleware/logger.js";
export interface AuthwitRouteDeps {
  config: AgentConfig;
  evmClients: MultiChainEVMClient;
  secretGenerator: SecretGenerator;
  authwitGenerator: AuthwitGenerator;
  logger: Logger;
}
export declare function createAuthwitRouter(deps: AuthwitRouteDeps): Router;
//# sourceMappingURL=authwit.d.ts.map
