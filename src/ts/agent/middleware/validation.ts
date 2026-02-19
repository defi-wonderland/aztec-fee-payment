import type { Request, Response, NextFunction } from "express";
import type { ZodSchema, ZodError } from "zod";
import type { ErrorResponse } from "../types/index.js";

/**
 * Create an Express middleware that validates request.body against a Zod schema.
 * Returns 400 with structured error for invalid requests.
 */
export function createValidationMiddleware(schema: ZodSchema) {
  return function validationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const zodError = result.error as ZodError;
      const details = zodError.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      const response: ErrorResponse = {
        error: "INVALID_REQUEST",
        message: "Request validation failed",
        details: { issues: details },
      };

      res.status(400).json(response);
      return;
    }

    // Replace body with parsed (and coerced) data
    req.body = result.data;
    next();
  };
}
