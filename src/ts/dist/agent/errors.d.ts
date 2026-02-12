import type { ErrorCode, ErrorResponse } from "./types/index.js";
export declare class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown> | undefined;
  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown> | undefined,
  );
  toResponse(): ErrorResponse;
}
export declare const invalidInput: (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => AppError;
export declare const notFound: (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => AppError;
export declare const rateLimited: (message?: string) => AppError;
export declare const internal: (
  message?: string,
  details?: Record<string, unknown>,
) => AppError;
//# sourceMappingURL=errors.d.ts.map
