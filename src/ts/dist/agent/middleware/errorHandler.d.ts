import type { Request, Response, NextFunction } from "express";
import type { Logger } from "./logger.js";
export declare function createErrorHandler(logger: Logger): (error: Error, req: Request, res: Response, _next: NextFunction) => void;
//# sourceMappingURL=errorHandler.d.ts.map