import type { Request, Response, NextFunction } from "express";
import type { ErrorCode, ErrorResponse } from "../types/index.js";
import type { Logger } from "./logger.js";

const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_SIGNATURE: 400,
  TX_NOT_FOUND: 404,
  TX_NOT_FINALIZED: 400,
  WRONG_RECIPIENT: 400,
  INVALID_AMOUNT: 400,
  INVALID_CHAIN: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  toResponse(): ErrorResponse {
    return {
      error: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }

  getStatusCode(): number {
    return ERROR_STATUS_MAP[this.code];
  }
}

/**
 * Express error handler that normalizes all errors into structured ErrorResponse.
 */
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
      res.status(error.getStatusCode()).json(error.toResponse());
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
