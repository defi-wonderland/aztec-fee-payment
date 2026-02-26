import { z } from "zod";
import type { Address, Hex } from "viem";

// ── Error Codes ──────────────────────────────────────────────────────────────

export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SIGNATURE"
  | "TX_NOT_FOUND"
  | "TX_REVERTED"
  | "TX_NOT_FINALIZED"
  | "WRONG_RECIPIENT"
  | "INVALID_AMOUNT"
  | "INVALID_CHAIN"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

// ── Response types (no corresponding Zod schema) ────────────────────────────

export interface AuthwitResponse {
  amount: string;
  secret: string;
  authwit: {
    innerHash: string;
    outerHash: string;
    witness: string[];
  };
}

export interface ErrorResponse {
  error: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const hexPattern = /^0x[0-9a-fA-F]+$/;

/** 0x-prefixed 32-byte hex (66 chars) */
const bytes32Hex = z
  .string()
  .regex(
    /^0x[0-9a-fA-F]{64}$/,
    "Must be 0x-prefixed 32-byte hex",
  ) as z.ZodType<Hex>;

/** 0x-prefixed 65-byte hex (132 chars) */
const signatureHex = z
  .string()
  .regex(
    /^0x[0-9a-fA-F]{130}$/,
    "Must be 0x-prefixed 65-byte hex",
  ) as z.ZodType<Hex>;

export const authwitRequestSchema = z.object({
  evmTxHash: bytes32Hex,
  evmChainId: z.number().int().positive(),
  signature: signatureHex,
});

/** 0x-prefixed 20-byte EVM address (42 chars) */
const hexAddress = z
  .string()
  .regex(
    /^0x[0-9a-fA-F]{40}$/,
    "Must be 0x-prefixed 20-byte address",
  ) as z.ZodType<Address>;
const hexKey = z
  .string()
  .regex(hexPattern, "Must be 0x-prefixed hex") as z.ZodType<Hex>;

export const configSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().min(1).default("0.0.0.0"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),

  chains: z
    .record(
      z.coerce.number().int().positive(),
      z.object({
        name: z.string().min(1),
        rpcUrl: z.string().url(),
        topUpContractAddress: hexAddress,
        requiredConfirmations: z.number().int().min(0).default(1),
      }),
    )
    .refine((chains) => Object.keys(chains).length > 0, {
      message: "At least one chain must be configured",
    }),

  spSigningKey: hexKey,

  minAmount: z.bigint().min(0n).default(1n),

  rateLimit: z
    .object({
      windowMs: z.number().int().positive().default(60_000),
      maxRequests: z.number().int().positive().default(100),
    })
    .default({}),

  aztec: z.object({
    fpcAddress: z.string().min(1),
    ownerAddress: z.string().min(1),
  }),
});

// ── Derived types from Zod schemas ──────────────────────────────────────────

export type AuthwitRequestBody = z.infer<typeof authwitRequestSchema>;
export type ChainConfig = z.infer<typeof configSchema>["chains"][number];
export type AgentConfig = z.infer<typeof configSchema>;
