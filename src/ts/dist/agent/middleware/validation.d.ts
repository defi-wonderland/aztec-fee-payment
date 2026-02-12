import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
/**
 * Create an Express middleware that validates request.body against a Zod schema.
 * Returns 400 with structured error for invalid requests.
 */
export declare function createValidationMiddleware(
  schema: ZodSchema,
): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=validation.d.ts.map
