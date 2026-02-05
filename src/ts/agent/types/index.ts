/**
 * Type definitions for the FPC Off-Chain Agent
 */

import type { Address, Hex } from "viem";

// ============================================================================
// Configuration Types
// ============================================================================

export interface ChainConfig {
  name: string;
  rpcUrl: string;
  feeCollectorAddress: Address;
  aztTokenAddress: Address;
  requiredConfirmations: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface AztecConfig {
  fpcAddress: string;
  ownerAddress: string;
}

export interface AgentConfig {
  port: number;
  host: string;
  logLevel: "debug" | "info" | "warn" | "error";
  chains: Record<number, ChainConfig>;
  spSigningKey: Hex;
  rateLimit: RateLimitConfig;
  aztec: AztecConfig;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

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

export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SIGNATURE"
  | "TX_NOT_FOUND"
  | "TX_NOT_FINALIZED"
  | "WRONG_RECIPIENT"
  | "INVALID_CHAIN"
  | "INVALID_AMOUNT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ErrorResponse {
  error: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// EVM Types
// ============================================================================

export interface TransactionInfo {
  hash: Hex;
  from: Address;
  to: Address;
  amount: bigint;
  blockNumber: bigint;
  confirmations: bigint;
}

export interface TransactionValidationResult {
  valid: boolean;
  error?: ErrorCode;
  errorMessage?: string;
  transaction?: TransactionInfo;
}

// ============================================================================
// Authwit Types
// ============================================================================

export interface MintAuthwit {
  amount: bigint;
  secret: string;
  innerHash: string;
  outerHash: string;
  witness: string[];
}
