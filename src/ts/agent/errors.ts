import type { ErrorCode, ErrorResponse } from "./types/index.js";

// ── Single concrete error class ─────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }

  toResponse(): ErrorResponse {
    return {
      error: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ── Factory functions ───────────────────────────────────────────────────────

export const invalidInput = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => new AppError(400, code, message, details);

export const notFound = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => new AppError(404, code, message, details);

export const rateLimited = (message = "Too many requests") =>
  new AppError(429, "RATE_LIMITED", message);

export const internal = (
  message = "Internal server error",
  details?: Record<string, unknown>,
) => new AppError(500, "INTERNAL_ERROR", message, details);
