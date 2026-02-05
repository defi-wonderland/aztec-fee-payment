/**
 * Request Validation Middleware
 *
 * Validates incoming requests using Zod schemas.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ZodError, type ZodSchema } from "zod";
import type { ErrorResponse } from "../types/index.js";

/**
 * Create a validation prehandler for Fastify
 */
export function createValidationPreHandler<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.body);
      // Replace body with validated data
      (request as any).body = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const errorResponse: ErrorResponse = {
          error: "INVALID_REQUEST",
          message: "Request validation failed",
          details: {
            errors: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
        };
        return reply.status(400).send(errorResponse);
      }
      throw error;
    }
  };
}

/**
 * Validate hex string format
 */
export function isValidHex(value: string, expectedLength?: number): boolean {
  if (!value.startsWith("0x")) return false;
  const hex = value.slice(2);
  if (!/^[0-9a-fA-F]*$/.test(hex)) return false;
  if (expectedLength !== undefined && hex.length !== expectedLength * 2) {
    return false;
  }
  return true;
}

/**
 * Validate that a hex string is exactly 32 bytes
 */
export function isValid32ByteHex(value: string): boolean {
  return isValidHex(value, 32);
}

/**
 * Validate that a hex string is exactly 65 bytes (EIP-712 signature)
 */
export function isValid65ByteHex(value: string): boolean {
  return isValidHex(value, 65);
}

/**
 * Validate Ethereum address format
 */
export function isValidEthereumAddress(value: string): boolean {
  return isValidHex(value, 20);
}
