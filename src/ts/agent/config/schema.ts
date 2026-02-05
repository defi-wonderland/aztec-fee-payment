/**
 * Zod schemas for configuration validation
 */

import { z } from "zod";

const hex32Bytes = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Must be 32-byte hex string with 0x prefix");

const ethereumAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid Ethereum address");

const aztecAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Aztec address (must be 32 bytes)");

export const chainConfigSchema = z.object({
  name: z.string().min(1, "Chain name required"),
  rpcUrl: z.string().url("Invalid RPC URL"),
  feeCollectorAddress: ethereumAddress,
  aztTokenAddress: ethereumAddress,
  requiredConfirmations: z.number().int().positive(),
});

export const rateLimitConfigSchema = z.object({
  windowMs: z.number().int().positive().default(60000),
  maxRequests: z.number().int().positive().default(100),
});

export const aztecConfigSchema = z.object({
  fpcAddress: aztecAddress,
  ownerAddress: aztecAddress,
});

export const agentConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  chains: z.record(z.coerce.number().int().positive(), chainConfigSchema),
  spSigningKey: hex32Bytes,
  rateLimit: rateLimitConfigSchema.default({}),
  aztec: aztecConfigSchema,
});

// Request validation schemas
export const authwitRequestSchema = z.object({
  evmTxHash: hex32Bytes,
  evmChainId: z.number().int().positive(),
  signature: z
    .string()
    .regex(
      /^0x[0-9a-fA-F]{130}$/,
      "Signature must be 65-byte hex string with 0x prefix",
    ),
});

export type ChainConfigInput = z.input<typeof chainConfigSchema>;
export type AgentConfigInput = z.input<typeof agentConfigSchema>;
export type AuthwitRequestInput = z.input<typeof authwitRequestSchema>;
