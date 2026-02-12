import type { AgentConfig } from "./types/index.js";
export declare function createServer(config: AgentConfig): {
    app: import("express-serve-static-core").Express;
    logger: import("./middleware/logger.js").Logger;
};
//# sourceMappingURL=server.d.ts.map