import type { Request, Response, NextFunction } from "express";
import type { ErrorResponse } from "../types/index.js";
import type { Logger } from "./logger.js";
import { AppError } from "../errors.js";

export function createErrorHandler(logger: Logger) {
  return function errorHandler(
    error: Error,
    req: Request,
    res: Response,
    _next: NextFunction,
  ) {
    const requestId = req.headers["x-request-id"] ?? "unknown";

    if (error instanceof AppError) {
      logger.warn({ err: error, requestId }, error.message);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    // SyntaxError from JSON body parsing
    if (error instanceof SyntaxError && "body" in error) {
      logger.warn({ err: error, requestId }, error.message);
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Invalid JSON in request body",
      } satisfies ErrorResponse);
      return;
    }

    // Unexpected errors — hide internals
    logger.error({ err: error, requestId }, "Unhandled error");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    } satisfies ErrorResponse);
  };
}
