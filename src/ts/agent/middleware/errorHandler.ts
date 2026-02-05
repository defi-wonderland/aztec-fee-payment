/**
 * Error Handling Middleware
 *
 * Centralized error handling for consistent error responses.
 */

import type { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import type { ErrorResponse, ErrorCode } from "../types/index.js";
import type { Logger } from "./logger.js";

/**
 * HTTP status codes for error codes
 */
const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_SIGNATURE: 400,
  TX_NOT_FOUND: 404,
  TX_NOT_FINALIZED: 400,
  WRONG_RECIPIENT: 400,
  INVALID_CHAIN: 400,
  INVALID_AMOUNT: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Application error with error code
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }

  toResponse(): ErrorResponse {
    return {
      error: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }

  getStatusCode(): number {
    return ERROR_STATUS_MAP[this.code];
  }
}

/**
 * Create the global error handler for Fastify
 */
export function createErrorHandler(logger: Logger) {
  return (
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const requestId = (request as any).id || "unknown";

    // Handle AppError
    if (error instanceof AppError) {
      logger.warn(
        { requestId, error: error.code, message: error.message },
        "Application error",
      );
      return reply.status(error.getStatusCode()).send(error.toResponse());
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      const response: ErrorResponse = {
        error: "RATE_LIMITED",
        message: "Too many requests",
      };
      return reply.status(429).send(response);
    }

    // Handle validation errors (from schema validation)
    if (error.validation) {
      const response: ErrorResponse = {
        error: "INVALID_REQUEST",
        message: "Request validation failed",
        details: {
          errors: error.validation.map((v) => ({
            path: v.instancePath,
            message: v.message,
          })),
        },
      };
      return reply.status(400).send(response);
    }

    // Log unexpected errors (without exposing details to client)
    logger.error(
      {
        requestId,
        error: error.message,
        stack: error.stack,
        code: error.code,
      },
      "Unexpected error",
    );

    // Return generic error response
    const response: ErrorResponse = {
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    };
    return reply.status(500).send(response);
  };
}

/**
 * Create a not found handler
 */
export function createNotFoundHandler() {
  return (_request: FastifyRequest, reply: FastifyReply) => {
    const response: ErrorResponse = {
      error: "INVALID_REQUEST",
      message: "Route not found",
    };
    return reply.status(404).send(response);
  };
}
