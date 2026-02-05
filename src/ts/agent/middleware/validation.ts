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
