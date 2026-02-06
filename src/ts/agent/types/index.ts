import { z } from "zod";
import type { Address, Hex } from "viem";

// ── Error Codes ──────────────────────────────────────────────────────────────

export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SIGNATURE"
  | "TX_NOT_FOUND"
  | "TX_NOT_FINALIZED"
  | "WRONG_RECIPIENT"
  | "INVALID_AMOUNT"
  | "INVALID_CHAIN"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

// ── Request / Response ───────────────────────────────────────────────────────

export interface AuthwitRequestBody {
  evmTxHash: Hex;
  evmChainId: number;
  signature: Hex;
}

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

// ── Configuration ────────────────────────────────────────────────────────────

export interface ChainConfig {
  name: string;
  rpcUrl: string;
  feeCollectorAddress: Address;
  aztTokenAddress: Address;
  requiredConfirmations: number;
}

export interface AgentConfig {
  port: number;
  host: string;
  logLevel: "debug" | "info" | "warn" | "error";

  chains: Record<number, ChainConfig>;

  spSigningKey: Hex;

  /** Minimum accepted transfer amount in wei. Defaults to 1. */
  minAmount: bigint;

  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };

  aztec: {
    fpcAddress: string;
    ownerAddress: string;
  };
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const hexPattern = /^0x[0-9a-fA-F]+$/;

/** 0x-prefixed 32-byte hex (66 chars) */
const bytes32Hex = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Must be 0x-prefixed 32-byte hex");

/** 0x-prefixed 65-byte hex (132 chars) */
const signatureHex = z
  .string()
  .regex(/^0x[0-9a-fA-F]{130}$/, "Must be 0x-prefixed 65-byte hex");

export const authwitRequestSchema = z.object({
  evmTxHash: bytes32Hex,
  evmChainId: z.number().int().positive(),
  signature: signatureHex,
});

/** 0x-prefixed hex of any length (for keys, addresses) */
const hexString = z.string().regex(hexPattern, "Must be 0x-prefixed hex");

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
        feeCollectorAddress: hexString,
        aztTokenAddress: hexString,
        requiredConfirmations: z.number().int().min(0).default(1),
      }),
    )
    .refine((chains) => Object.keys(chains).length > 0, {
      message: "At least one chain must be configured",
    }),

  spSigningKey: hexString,

  minAmount: z.bigint().min(0n).default(1n),

  rateLimit: z
    .object({
      windowMs: z.number().int().positive().default(60_000),
      maxRequests: z.number().int().positive().default(100),
    })
    .default({}),

  aztec: z.object({
    fpcAddress: hexString,
    ownerAddress: hexString,
  }),
});
