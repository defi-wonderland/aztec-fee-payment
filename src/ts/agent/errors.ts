import type { ErrorCode, ErrorResponse } from "./types/index.js";

// ── Base ─────────────────────────────────────────────────────────────────────

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }

  toResponse(): ErrorResponse {
    return {
      error: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ── 400 Bad Request ──────────────────────────────────────────────────────────

export class InvalidInputError extends AppError {
  readonly statusCode = 400 as const;
  readonly code: ErrorCode = "INVALID_REQUEST";
}

export class InvalidSignatureError extends InvalidInputError {
  override readonly code = "INVALID_SIGNATURE" as const;
}

export class TxNotFinalizedError extends InvalidInputError {
  override readonly code = "TX_NOT_FINALIZED" as const;
}

export class WrongRecipientError extends InvalidInputError {
  override readonly code = "WRONG_RECIPIENT" as const;
}

export class InvalidAmountError extends InvalidInputError {
  override readonly code = "INVALID_AMOUNT" as const;
}

export class InvalidChainError extends InvalidInputError {
  override readonly code = "INVALID_CHAIN" as const;
}

// ── 404 Not Found ────────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  readonly statusCode = 404 as const;
  readonly code: ErrorCode = "TX_NOT_FOUND";
}

export class TxNotFoundError extends NotFoundError {}

// ── 429 Too Many Requests ────────────────────────────────────────────────────

export class RateLimitedError extends AppError {
  readonly statusCode = 429 as const;
  readonly code = "RATE_LIMITED" as const;
}

// ── 500 Internal Server Error ────────────────────────────────────────────────

export class InternalError extends AppError {
  readonly statusCode = 500 as const;
  readonly code = "INTERNAL_ERROR" as const;
}

// ── Bridge from ErrorCode strings (for validator results) ────────────────────

const ERROR_CLASS_MAP: Record<
  ErrorCode,
  new (message: string, details?: Record<string, unknown>) => AppError
> = {
  INVALID_REQUEST: InvalidInputError,
  INVALID_SIGNATURE: InvalidSignatureError,
  TX_NOT_FOUND: TxNotFoundError,
  TX_NOT_FINALIZED: TxNotFinalizedError,
  WRONG_RECIPIENT: WrongRecipientError,
  INVALID_AMOUNT: InvalidAmountError,
  INVALID_CHAIN: InvalidChainError,
  RATE_LIMITED: RateLimitedError,
  INTERNAL_ERROR: InternalError,
};

export function fromErrorCode(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): AppError {
  const ErrorClass = ERROR_CLASS_MAP[code];
  return new ErrorClass(message, details);
}
