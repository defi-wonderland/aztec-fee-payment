# Off-Chain Agent — Project Specification

**Version**: 2.9
**Status**: In Progress
**Project**: Fee Payment Contract (FPC) Off-Chain Service
**Date**: February 2026

---

## Executive Summary

This document specifies the complete implementation plan for the FPC Off-Chain Agent — a stateless, privacy-preserving API service that enables users to claim wFJ (wrapped Fee Juice) on Aztec after paying on EVM chains.

### Core Responsibilities
1. Verify EVM payment transactions (AZT token transfers to fee collector)
2. Generate deterministic secrets from payment (txHash + sender) (signed with SP key)
3. Create Aztec authwits for `mint(amount, secret)` operations
4. Serve a stateless REST API

### Key Design Constraints
- **Stateless**: No database required; same request = same response
- **Deterministic**: `secret = sign(sha256(txHash || sender), spKey).r % Fr.MODULUS` is reproducible (RFC 6979; sender is the recovered EIP-712 signer)
- **Privacy-Preserving**: SP never learns user's Aztec address
- **Horizontally Scalable**: No shared state between instances

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OFF-CHAIN AGENT ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────────────────────────────────────────┐   │
│  │   EVM RPCs   │◄───│                                                  │   │
│  │ (Multi-chain)│    │                                                  │   │
│  └──────────────┘    │            STATELESS API SERVER                  │   │
│                      │                                                  │   │
│                      │  ┌────────────┐  ┌────────────┐  ┌───────────┐  │   │
│                      │  │  EIP-712   │  │   EVM Tx   │  │  Authwit  │  │   │
│                      │  │ Verifier   │  │  Validator │  │ Generator │  │   │
│                      │  └────────────┘  └────────────┘  └───────────┘  │   │
│                      │                                                  │   │
│                      └──────────────────────────────────────────────────┘   │
│                                         ▲                                   │
│                                         │                                   │
│                              POST /api/v1/authwit/request                   │
│                                         │                                   │
│                                    ┌────┴────┐                              │
│                                    │  User   │                              │
│                                    └─────────┘                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Milestones & Status

| Milestone | Description | Priority | Dependencies | Status |
|-----------|-------------|----------|--------------|--------|
| **M1** | Project Foundation | P0 | None | **COMPLETE** |
| **M2** | EVM Integration Layer | P0 | M1 | **COMPLETE** |
| **M3** | Cryptographic Core | P0 | M1 | **COMPLETE** |
| **M4** | API Server | P0 | M2, M3 | **COMPLETE** |
| **M5** | Integration Testing | P0 | M4 | **PARTIAL** |
| **M6** | Deployment & Operations | P1 | M5 | NOT STARTED |
| **M7** | Monitoring & Observability | P1 | M6 | **PARTIAL** |

---

## Milestone 1: Project Foundation

**Goal**: Establish project structure, tooling, and configuration management.
**Status**: COMPLETE

### Task 1.1: Project Scaffolding
**Priority**: P0 | **Status**: COMPLETE

**Acceptance Criteria**:
- [x] Create `src/ts/agent/` directory structure
- [x] Configure TypeScript for new module (extend existing tsconfig)
- [x] Add package.json scripts for agent development
- [x] Set up ESLint/Prettier configuration (match existing patterns)

**Directory Structure**:
```
src/ts/agent/
├── index.ts                 # Main entry point
├── server.ts                # HTTP server setup (Express)
├── .env.example             # Example environment configuration
├── config/
│   ├── index.ts             # Configuration loader (env → Zod validation)
│   └── schema.ts            # Zod validation schemas
├── services/
│   ├── evm/                 # EVM integration
│   │   ├── index.ts         # Barrel export
│   │   ├── client.ts        # Multi-chain RPC client (viem)
│   │   ├── parser.ts        # ERC20 Transfer event parser
│   │   └── validator.ts     # Transaction validation
│   └── crypto/              # Cryptographic operations
│       ├── index.ts         # Barrel export
│       ├── eip712.ts        # EIP-712 signature verification
│       ├── secret.ts        # Deterministic secret generation
│       └── authwit.ts       # Aztec authwit generation
├── routes/
│   └── authwit.ts           # /api/v1/authwit/* routes
├── middleware/
│   ├── index.ts             # Barrel export (rateLimit, validation, errorHandler, logger)
│   ├── rateLimit.ts         # Rate limiting (express-rate-limit)
│   ├── validation.ts        # Request validation (Zod)
│   ├── errorHandler.ts      # Error handling (AppError class)
│   └── logger.ts            # Structured logging (pino)
├── types/
│   └── index.ts             # TypeScript type definitions
└── test/
    ├── helpers.ts           # Test utilities and fixtures
    ├── eip712.test.ts       # EIP-712 signature tests
    ├── secret.test.ts       # Secret generation tests
    ├── authwit.test.ts      # Authwit generation tests
    ├── validator.test.ts    # Transaction validation tests
    ├── evm-parser.test.ts   # ERC20 transfer parser tests
    ├── config.test.ts       # Configuration loading tests
    └── integration.test.ts  # Integration tests (mocked)
```

### Task 1.2: Configuration Management
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: Task 1.1

**Acceptance Criteria**:
- [x] Environment variable loading with dotenv
- [x] Configuration validation with Zod
- [x] Support for multiple environments (local, devnet, testnet, mainnet)
- [x] Secure handling of SP signing key

**Configuration Schema**:
```typescript
interface AgentConfig {
  // Server
  port: number;                          // Default: 3000
  host: string;                          // Default: '0.0.0.0'
  logLevel: 'debug' | 'info' | 'warn' | 'error';  // Default: 'info'
  trustProxy: boolean | number | string; // Default: false (Express trust proxy for IP resolution)

  // Supported EVM Chains
  chains: {
    [chainId: number]: {
      name: string;
      rpcUrl: string;
      feeCollectorAddress: Address;      // 20-byte EVM address
      aztTokenAddress: Address;          // 20-byte EVM address
      requiredConfirmations: number;     // Finality threshold
    };
  };

  // Security
  spSigningKey: Hex;                     // 32-byte hex private key

  // Rate Limiting
  rateLimit: {
    windowMs: number;                    // Default: 60000 (1 minute)
    maxRequests: number;                 // Default: 100
  };

  // Aztec
  aztec: {
    fpcAddress: string;                  // FPC contract address (32-byte hex)
    ownerAddress: string;                // Owner account address (32-byte hex)
    chainId: bigint;                     // Required Aztec chain ID (no default)
  };
}
```

**Environment Variables**:
```bash
# Required
SP_SIGNING_KEY=0x...                     # 32-byte hex private key (for authwit signing)
FPC_ADDRESS=0x...                        # Aztec FPC contract address (32-byte hex)
OWNER_ADDRESS=0x...                      # Aztec owner address (32-byte hex)
AZTEC_CHAIN_ID=1                         # Aztec chain ID for outer authwit hash

# Optional (with defaults)
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000              # Rate limit window in ms
RATE_LIMIT_MAX_REQUESTS=100             # Max requests per window

# Proxy trust (for client IP resolution in rate limiting)
# Default: false. Set to 1/true or subnet list when behind a trusted reverse proxy.
TRUST_PROXY=false

# Development
NODE_ENV=production                      # Set to 'development' for pretty-printed logs

# Per-chain configuration (at least one chain required)
CHAIN_8453_RPC_URL=https://mainnet.base.org
CHAIN_8453_FEE_COLLECTOR=0x...          # Fee collector address
CHAIN_8453_AZT_TOKEN=0x...             # AZT token address on this chain
CHAIN_8453_CONFIRMATIONS=12

CHAIN_84532_RPC_URL=https://sepolia.base.org
CHAIN_84532_FEE_COLLECTOR=0x...
CHAIN_84532_AZT_TOKEN=0x...
CHAIN_84532_CONFIRMATIONS=6
```

### Task 1.3: Logging Infrastructure
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: Task 1.1

**Acceptance Criteria**:
- [x] Structured JSON logging with pino
- [x] Request ID propagation (via `x-request-id` header or auto-generated UUID)
- [x] Log levels: debug, info, warn, error
- [x] Sensitive data redaction (keys, signatures, secrets, witnesses)
- [x] Pretty printing in development mode (`NODE_ENV !== 'production'`)

**Implementation** (`middleware/logger.ts`):
- Uses `pino` with ISO timestamp formatting
- Redacts: `spSigningKey`, `req.headers.authorization`, `req.body.signature`, `secret`, `witness`, `privateKey`, `signingKey`
- JSON format in production, pretty-printed (via `pino-pretty`) in development
- Exported `Logger` type alias for `pino.Logger`

---

## Milestone 2: EVM Integration Layer

**Goal**: Build robust EVM transaction verification capabilities.
**Status**: COMPLETE

### Task 2.1: Multi-Chain RPC Client
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: M1

**Acceptance Criteria**:
- [x] Support multiple EVM chains (Ethereum, Base, etc.)
- [x] Use viem for RPC interactions (already in project)
- [x] Retry logic via viem http transport
- [x] Graceful handling of RPC failures (returns null instead of throwing)

**Implementation**:
```typescript
// src/ts/agent/services/evm/client.ts
import { createPublicClient, http, Chain } from 'viem';

interface EVMClient {
  chainId: number;
  getTransaction(txHash: Hex): Promise<Transaction | null>;
  getTransactionReceipt(txHash: Hex): Promise<TransactionReceipt | null>;
  getBlockNumber(): Promise<bigint>;
}

class MultiChainEVMClient {
  private clients: Map<number, EVMClient>;

  constructor(chainConfigs: Record<number, ChainConfig>, logger: Logger) { ... }

  getClientForChain(chainId: number): EVMClient | undefined { ... }
  isChainSupported(chainId: number): boolean { ... }
  getSupportedChains(): number[] { ... }
}
```

**Transport Configuration**:
- `retryCount: 3` — automatic retries for failed RPC calls
- `retryDelay: 1000` — 1 second between retries
- `timeout: 30000` — 30 second timeout per request

### Task 2.2: Transaction Validator
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: Task 2.1

**Acceptance Criteria**:
- [x] Fetch transaction by hash
- [x] Verify transaction succeeded (status = 'success')
- [x] Verify transaction is finalized (enough confirmations)
- [x] Filter ERC20 Transfer events by `from` (recovered EIP-712 signer), AZT token address, AND fee collector recipient
- [x] Sum only matching transfer amounts (only transfers from the recovered signer are counted)
- [x] Reject zero-amount transfers (`INVALID_AMOUNT`)

**Validation Flow**:
```typescript
// src/ts/agent/services/evm/validator.ts

interface ValidateTransactionOptions {
  client: EVMClient;
  txHash: Hex;
  from: Address;                     // Recovered from EIP-712 signature by the route handler
  feeCollectorAddress: Address;
  aztTokenAddress: Address;          // Only AZT token transfers accepted
  requiredConfirmations: number;
  minAmount: bigint;
  logger: Logger;
}

async function validateTransaction(
  options: ValidateTransactionOptions
): Promise<{ amount: bigint }>;
```

**Validation Steps**:
1. Fetch receipt (returns `TX_NOT_FOUND` if missing)
2. Verify status is `'success'` (returns `TX_REVERTED` if failed)
3. Check confirmations against `requiredConfirmations` (returns `TX_NOT_FINALIZED`)
4. Parse Transfer events, filter by `from` (recovered signer), AZT token, AND fee collector (returns `WRONG_RECIPIENT` if no matches)
5. Sum matching transfer amounts, reject if below `minAmount` (returns `INVALID_AMOUNT`)

### Task 2.3: ERC20 Transfer Parser
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: Task 2.1

**Acceptance Criteria**:
- [x] Parse ERC20 Transfer events from transaction receipt using viem `decodeEventLog`
- [x] Extract: token, from, to, amount
- [x] Handle multiple transfers in single transaction
- [x] Filter by both AZT token address and fee collector recipient

**Implementation**:
```typescript
// src/ts/agent/services/evm/parser.ts

interface ParsedTransfer {
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
}

function parseTransferEvents(receipt: TransactionReceipt): ParsedTransfer[];

/**
 * Find all AZT token transfers from a specific sender to the fee collector address.
 * Filters by `from`, `to` (fee collector), and `token` (AZT).
 * Returns an array of matching transfers (caller sums amounts if needed).
 */
function findFeeCollectorTransfers(
  transfers: ParsedTransfer[],
  feeCollectorAddress: Address,
  aztTokenAddress: Address,
  from: Address
): ParsedTransfer[];
```

---

## Milestone 3: Cryptographic Core

**Goal**: Implement EIP-712 verification and deterministic secret generation.
**Status**: COMPLETE

### Task 3.1: EIP-712 Sender Recovery
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: M1

**Acceptance Criteria**:
- [x] Implement EIP-712 domain and types as specified
- [x] Recover signer address from signature (via viem `recoverTypedDataAddress`)
- [x] Recovered address is passed as `from` to the validator (no separate verify step)
- [x] Support multiple chain IDs in domain
- [x] Helper function `getTypedDataForSigning()` for client-side use

**EIP-712 Specification**:
```typescript
// src/ts/agent/services/crypto/eip712.ts

const EIP712_DOMAIN = {
  name: 'Aztec FPC Claim',
  version: '1',
  // chainId set dynamically per request
};

const EIP712_TYPES = {
  ClaimRequest: [
    { name: 'txHash', type: 'bytes32' },
  ],
};

interface ClaimRequestMessage {
  txHash: Hex;
}

async function recoverClaimRequestSigner(
  message: ClaimRequestMessage,
  signature: Hex,
  chainId: number
): Promise<Address>;

// Helper for client-side signing
function getTypedDataForSigning(txHash: Hex, chainId: number): TypedData;
```

### Task 3.2: Deterministic Secret Generation
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: M1

**Acceptance Criteria**:
- [x] Generate deterministic secret from txHash + sender using SP signing key
- [x] Same txHash + same sender always produces same secret (deterministic via RFC 6979)
- [x] Secret is keyed (only the SP can generate it)
- [x] Secret is a valid Aztec field element (reduced modulo BN254 Fr)
- [x] Returns `Hex` string (not Fr object)

**Implementation**:
```typescript
// src/ts/agent/services/crypto/secret.ts

import { secp256k1 } from '@noble/curves/secp256k1';

// BN254 scalar field modulus
const BN254_FR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

class SecretGenerator {
  private signingKey: Uint8Array;

  constructor(spSigningKeyHex: Hex) {
    this.signingKey = hexToBytes(spSigningKeyHex);
  }

  /**
   * Generate a deterministic secret by signing sha256(txHash || sender) with the SP key.
   *
   * Process:
   * 1. Concatenate 32-byte txHash with 20-byte sender address
   * 2. SHA-256 hash the concatenation to produce a 32-byte ECDSA signing input
   * 3. Sign with SP key (deterministic ECDSA via RFC 6979)
   * 4. Take first 32 bytes (r component)
   * 5. Reduce modulo BN254 Fr field
   *
   * @returns Secret as 0x-prefixed 32-byte hex string (zero-padded)
   */
  generateSecret(txHash: Hex, sender: Address): Hex {
    const txHashBytes = hexToBytes(txHash);
    const senderBytes = hexToBytes(sender);
    const preimage = new Uint8Array([...txHashBytes, ...senderBytes]);
    const msgHash = sha256(preimage);
    const signature = secp256k1.sign(msgHash, this.signingKey);
    const rBytes = signature.toCompactRawBytes().slice(0, 32);
    const secretBigInt = BigInt('0x' + bytesToHex(rBytes)) % BN254_FR_MODULUS;
    return `0x${secretBigInt.toString(16).padStart(64, '0')}` as Hex;
  }
}
```

**Design Notes**:
- The secret is **keyed**: only the holder of the SP signing key can produce it, preventing unauthorized secret generation.
- The secret is **sender-bound**: the sender address (recovered from EIP-712 signature) is included in the signing input, providing per-sender secret isolation. Different senders for the same txHash produce different secrets.
- RFC 6979 guarantees determinism: same key + same `sha256(txHash || sender)` always yields the same ECDSA signature, thus the same secret.

### Task 3.3: Aztec Authwit Generation
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: Task 3.2

**Acceptance Criteria**:
- [x] Generate custom authwit for `mint(amount, secret)` without caller binding
- [x] Authwit format compatible with FPC contract validation
- [x] Uses Aztec SDK: `computeInnerAuthWitHash`, `computeOuterAuthWitHash`
- [x] Schnorr signing on Grumpkin curve
- [x] Supports configurable Aztec `chainId` and `version` parameters
- [x] All output types are strings (not Fr/AuthWitness objects)
- [x] Helper `formatAuthwitResponse()` for API response formatting

**Implementation**:
```typescript
// src/ts/agent/services/crypto/authwit.ts

import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeInnerAuthWitHash, computeOuterAuthWitHash } from '@aztec/stdlib/auth-witness';

interface MintAuthwit {
  amount: bigint;
  secret: string;        // Hex string
  innerHash: string;     // Fr.toString()
  outerHash: string;     // Fr.toString()
  witness: string[];     // Signature fields as strings
}

class AuthwitGenerator {
  private fpcAddress: AztecAddress;
  private ownerAddress: AztecAddress;
  private ownerSigningKey: GrumpkinScalar;
  private schnorr: Schnorr;
  private chainId: Fr;   // Required
  private version: Fr;   // Default: 1n

  constructor(config: {
    fpcAddress: string;
    ownerAddress: string;
    ownerSigningKey: Hex;
    chainId: bigint;      // Required Aztec chain ID
    version?: bigint;     // Optional Aztec version
  }) { ... }

  async generateMintAuthwit(amount: bigint, secretHex: Hex): Promise<MintAuthwit> {
    // 1. Convert inputs to Fr
    // 2. Compute inner_hash = computeInnerAuthWitHash([amount, secret])
    // 3. Compute outer_hash = computeOuterAuthWitHash(fpcAddress, chainId, version, innerHash)
    // 4. Sign outer_hash with Schnorr (Grumpkin curve)
    // 5. Return all values as strings
  }
}

function formatAuthwitResponse(authwit: MintAuthwit): AuthwitResponse;
```

**Authwit Hash Computation** (Aztec protocol):
```
inner_hash = computeInnerAuthWitHash([amount, secret])

outer_hash = computeOuterAuthWitHash(
  FPC_ADDRESS,        // consumer (who will verify)
  CHAIN_ID,           // Aztec chain ID
  VERSION,            // Aztec version
  inner_hash
)

witness = schnorr.sign(outer_hash, ownerSigningKey)
```

---

## Milestone 4: API Server

**Goal**: Build the REST API server with all endpoints and middleware.
**Status**: COMPLETE

### Task 4.1: Server Framework Setup
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: M1

**Acceptance Criteria**:
- [x] Set up Express server with CORS
- [x] Trust proxy configurable via `config.trustProxy` (default: false)
- [x] Health check endpoint (`GET /health`)
- [x] Request ID generation (UUID via `x-request-id` header or auto-generated)
- [x] Graceful shutdown handling (SIGTERM, SIGINT)
- [x] Request/response logging hooks

**Implementation**:
```typescript
// src/ts/agent/server.ts

import express from 'express';
import cors from 'cors';

const app = express();
// Secure default: trust proxy only when explicitly configured (TRUST_PROXY env)
app.set('trust proxy', config.trustProxy);

app.use(cors({ origin: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', chains: [...] });
});

// API routes under /api/v1 prefix
app.use('/api/v1', authwitRouter);
```

### Task 4.2: Request Validation Middleware
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: Task 4.1

**Acceptance Criteria**:
- [x] Validate request body schema with Zod (via `createValidationPreHandler`)
- [x] Validate txHash format (32 bytes hex)
- [x] Validate chainId is supported
- [x] Validate signature format (65 bytes hex)
- [x] Return structured error responses

**Request/Response Schemas**:
```typescript
// src/ts/agent/types/index.ts

// Request
interface AuthwitRequestBody {
  evmTxHash: Hex;      // 0x-prefixed 32-byte hex
  evmChainId: number;  // Supported chain ID
  signature: Hex;      // 0x-prefixed 65-byte EIP-712 signature
}

// Success Response
interface AuthwitResponse {
  amount: string;      // Decimal string (wei)
  secret: string;      // 0x-prefixed hex string
  authwit: {
    innerHash: string;
    outerHash: string;
    witness: string[];
  };
}

// Error Response
interface ErrorResponse {
  error: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

### Task 4.3: Rate Limiting Middleware
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: Task 4.1

**Acceptance Criteria**:
- [x] Rate limit by IP address (with `X-Forwarded-For` support when proxy trusted)
- [x] Configurable window and max requests via env vars
- [x] Return 429 with rate limit headers and Retry-After
- [x] Custom error response in structured format

**Implementation**:
```typescript
// src/ts/agent/middleware/rateLimit.ts

// Uses express-rate-limit
// Key: req.ip (resolved via Express trust proxy setting) or req.socket.remoteAddress fallback
// TRUST_PROXY controls Express trust proxy — set true/1/subnet when behind a reverse proxy
// Headers added: x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, retry-after
```

### Task 4.4: Authwit Request Handler
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: M2, M3, Task 4.2

**Acceptance Criteria**:
- [x] Implement `POST /api/v1/authwit/request` endpoint
- [x] Full request validation and error handling
- [x] Stateless processing (same input = same output)
- [x] Comprehensive logging with request-scoped child logger

**Handler Flow**:
```typescript
// src/ts/agent/routes/authwit.ts

async function handleAuthwitRequest(
  request: AuthwitRequestBody
): Promise<AuthwitResponse | ErrorResponse> {
  // 1. VALIDATE CHAIN IS SUPPORTED
  const client = evmClients.getClientForChain(request.evmChainId);
  if (!client) throw AppError('INVALID_CHAIN', ...);

  // 2. RECOVER SENDER FROM EIP-712 SIGNATURE
  //    - Recovers signer address (INVALID_SIGNATURE if malformed)
  //    - Recovered address used as `from` filter in validation
  let from;
  try {
    from = await recoverClaimRequestSigner(
      { txHash: request.evmTxHash },
      request.signature,
      request.evmChainId,
    );
  } catch {
    throw AppError('INVALID_SIGNATURE', ...);
  }

  // 3. VALIDATE EVM TRANSACTION
  //    - Fetch receipt, verify success status
  //    - Check finality (confirmations)
  //    - Filter AZT transfers by: from (recovered signer), to (fee collector), token (AZT)
  //    - Sum matching amounts, reject if below minimum
  const txResult = await validateTransaction({
    client,
    txHash: request.evmTxHash,
    from,
    feeCollectorAddress: chainConfig.feeCollectorAddress,
    aztTokenAddress: chainConfig.aztTokenAddress,
    requiredConfirmations: chainConfig.requiredConfirmations,
    minAmount: config.minAmount,
    logger: requestLogger,
  });

  // 4. GENERATE DETERMINISTIC SECRET (keyed to SP signing key, txHash + sender)
  const secret = secretGenerator.generateSecret(request.evmTxHash, from);

  // 5. GENERATE AUTHWIT
  const authwit = await authwitGenerator.generateMintAuthwit(
    txResult.amount,
    secret,
  );

  // 6. RETURN RESPONSE
  return formatAuthwitResponse(authwit);
}
```

**Note**: The handler recovers the sender from the EIP-712 signature *before* validating the EVM transaction. The recovered address is passed as `from` to the validator, which uses it to filter Transfer events. If the recovered signer has no matching AZT transfers to the fee collector, the validator returns `WRONG_RECIPIENT`. There is no separate signature verification step — recovery and filtering serve as implicit verification.

### Task 4.5: Error Handling Middleware
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: Task 4.1

**Acceptance Criteria**:
- [x] Catch all unhandled errors via `AppError` class
- [x] Return structured error responses
- [x] Log errors with request context
- [x] Never expose internal error details to clients
- [x] Not-found handler for unknown routes

**Error Codes**:
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request body |
| `INVALID_SIGNATURE` | 400 | EIP-712 signature malformed (cannot recover signer address) |
| `TX_NOT_FOUND` | 404 | Transaction hash not found on chain |
| `TX_REVERTED` | 400 | Transaction found but reverted on-chain |
| `TX_NOT_FINALIZED` | 400 | Transaction not yet finalized |
| `WRONG_RECIPIENT` | 400 | No AZT transfer from recovered signer to fee collector address found |
| `INVALID_AMOUNT` | 400 | Transfer amount is zero or negative |
| `INVALID_CHAIN` | 400 | Chain ID not supported |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

**AppError Class**:
```typescript
class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) { ... }

  toResponse(): ErrorResponse { ... }
  getStatusCode(): number { ... }
}
```

---

## Milestone 5: Integration Testing

**Goal**: Comprehensive test coverage for all components.
**Status**: PARTIAL (unit tests and mocked integration tests complete; E2E tests pending)

### Task 5.1: Unit Tests
**Priority**: P0 | **Status**: COMPLETE
**Dependencies**: M2, M3

**Test Coverage**:
```
src/ts/agent/test/
├── helpers.ts              # Test fixtures and utilities
├── eip712.test.ts          # EIP-712 signature verification
├── secret.test.ts          # Deterministic secret generation
├── authwit.test.ts         # Authwit generation
├── validator.test.ts       # Transaction validation
├── evm-parser.test.ts      # ERC20 transfer parsing
├── config.test.ts          # Configuration loading/validation
└── integration.test.ts     # Mocked end-to-end flow
```

**Acceptance Criteria**:
- [x] Test all crypto operations (EIP-712, secret, authwit)
- [x] Test EVM services (parser, validator)
- [x] Test configuration loading and validation
- [x] Mock all external dependencies (RPC, etc.)
- [x] Test edge cases and error paths
- [x] Determinism tests (same input = same output)
- [ ] client.test.ts (not yet implemented)

### Task 5.2: Integration Tests
**Priority**: P0 | **Status**: PARTIAL
**Dependencies**: M4

**Test Scenarios** (implemented with mocked dependencies):
```typescript
// src/ts/agent/test/integration.test.ts

describe('Authwit Request Flow', () => {
  it('returns valid authwit for legitimate payment');
  it('returns same response for same txHash (idempotent)');
  it('rejects invalid signature');
  it('rejects unfinalized transaction');
  it('rejects wrong recipient');
});
```

### Task 5.3: End-to-End Tests
**Priority**: P0 | **Status**: NOT STARTED
**Dependencies**: Task 5.2

**Acceptance Criteria**:
- [ ] Test full flow: EVM payment → API request → Aztec mint
- [ ] Requires local Aztec sandbox
- [ ] Requires forked EVM testnet (Anvil/Hardhat)
- [ ] Verify minted balance on Aztec

**E2E Test Flow**:
```
1. Start local Aztec sandbox
2. Deploy FPC contract
3. Fund FPC with Fee Juice
4. Start agent server
5. Fork Base Sepolia with Anvil
6. Execute ERC20 transfer to fee collector
7. Sign EIP-712 claim request
8. POST to agent API
9. Call FPC.mint() with returned authwit
10. Verify user has wFJ balance
```

---

## Milestone 6: Deployment & Operations

**Goal**: Production-ready deployment infrastructure.
**Status**: NOT STARTED

### Task 6.1: Docker Configuration
**Priority**: P1
**Dependencies**: M5

**Acceptance Criteria**:
- [ ] Multi-stage Dockerfile for minimal image size
- [ ] docker-compose for local development
- [ ] Health check in container
- [ ] Non-root user execution

**Dockerfile**:
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S agent -u 1001
COPY --from=builder --chown=agent:nodejs /app/dist ./dist
COPY --from=builder --chown=agent:nodejs /app/node_modules ./node_modules
USER agent
EXPOSE 3000
HEALTHCHECK CMD wget -q -O /dev/null http://localhost:3000/health || exit 1
CMD ["node", "dist/agent/index.js"]
```

### Task 6.2: CI/CD Pipeline
**Priority**: P1
**Dependencies**: Task 6.1

**Acceptance Criteria**:
- [ ] GitHub Actions workflow
- [ ] Run tests on PR
- [ ] Build and push Docker image on merge
- [ ] Deploy to staging/production environments

### Task 6.3: Configuration for Multiple Environments
**Priority**: P1
**Dependencies**: Task 6.1

**Deployment Guidance**:
- **Direct deployment**: Leave `TRUST_PROXY=false` (default). Rate limiting uses `req.socket.remoteAddress`.
- **Behind reverse proxy** (nginx, load balancer, CDN): Set `TRUST_PROXY=true` or `1` so `req.ip` uses `X-Forwarded-For` for correct per-client rate limiting.

**Environments**:
| Environment | EVM Chains | Aztec Network |
|-------------|------------|---------------|
| Local | Anvil fork | Local sandbox |
| Devnet | Sepolia, Base Sepolia | Aztec Devnet |
| Testnet | Sepolia, Base Sepolia | Aztec Testnet |
| Mainnet | Ethereum, Base | Aztec Mainnet |

---

## Milestone 7: Monitoring & Observability

**Goal**: Production observability and alerting.
**Status**: PARTIAL (structured logging complete; metrics and alerting not started)

### Task 7.1: Metrics Collection
**Priority**: P1 | **Status**: NOT STARTED
**Dependencies**: M6

**Metrics to Track**:
```
# Request metrics
fpc_agent_requests_total{status, chain_id, error_code}
fpc_agent_request_duration_seconds{chain_id}

# EVM metrics
fpc_agent_evm_rpc_requests_total{chain_id, method, status}
fpc_agent_evm_rpc_duration_seconds{chain_id}

# Business metrics
fpc_agent_authwits_generated_total{chain_id}
fpc_agent_amount_claimed_total{chain_id}
```

### Task 7.2: Alerting Rules
**Priority**: P1 | **Status**: NOT STARTED
**Dependencies**: Task 7.1

**Alerts**:
- High error rate (>5% of requests failing)
- High latency (p99 > 5s)
- RPC failures
- Rate limit exhaustion

### Task 7.3: Structured Logging
**Priority**: P1 | **Status**: COMPLETE
**Dependencies**: M4

Implemented via `middleware/logger.ts` using pino. See Task 1.3 for details.

**Log Format** (production):
```json
{
  "level": "info",
  "time": "2026-02-05T12:00:00.000Z",
  "requestId": "abc-123",
  "msg": "Authwit generated",
  "chainId": 8453,
  "txHash": "0x...",
  "amount": "1000000000000000000"
}
```

---

## Task Dependency Graph

```
M1: Project Foundation ............................ COMPLETE
├── T1.1: Project Scaffolding ................... COMPLETE
├── T1.2: Configuration Management ──────┐ ..... COMPLETE
└── T1.3: Logging Infrastructure ────────┤ ..... COMPLETE
                                         │
M2: EVM Integration Layer ◄──────────────┤ ..... COMPLETE
├── T2.1: Multi-Chain RPC Client         │ ..... COMPLETE
├── T2.2: Transaction Validator          │ ..... COMPLETE
└── T2.3: ERC20 Transfer Parser          │ ..... COMPLETE
                                         │
M3: Cryptographic Core ◄─────────────────┘ ..... COMPLETE
├── T3.1: EIP-712 Signature Verification ...... COMPLETE
├── T3.2: Deterministic Secret Generation ........ COMPLETE
└── T3.3: Aztec Authwit Generation ............ COMPLETE
                    │
                    ▼
M4: API Server ◄────┴──────────────────── ...... COMPLETE
├── T4.1: Server Framework Setup .............. COMPLETE
├── T4.2: Request Validation Middleware ....... COMPLETE
├── T4.3: Rate Limiting Middleware ............ COMPLETE
├── T4.4: Authwit Request Handler ............. COMPLETE
└── T4.5: Error Handling Middleware ........... COMPLETE
                    │
                    ▼
M5: Integration Testing ...................... PARTIAL
├── T5.1: Unit Tests ........................ COMPLETE
├── T5.2: Integration Tests ................. PARTIAL
└── T5.3: End-to-End Tests ................. NOT STARTED
                    │
                    ▼
M6: Deployment & Operations ................. NOT STARTED
├── T6.1: Docker Configuration
├── T6.2: CI/CD Pipeline
└── T6.3: Environment Configuration
                    │
                    ▼
M7: Monitoring & Observability .............. PARTIAL
├── T7.1: Metrics Collection ............... NOT STARTED
├── T7.2: Alerting Rules ................... NOT STARTED
└── T7.3: Structured Logging ............... COMPLETE
```

---

## Priority Summary

### P0 (Must Have) — Core Functionality
| Task | Description | Status |
|------|-------------|--------|
| T1.1 | Project Scaffolding | COMPLETE |
| T1.2 | Configuration Management | COMPLETE |
| T1.3 | Logging Infrastructure | COMPLETE |
| T2.1 | Multi-Chain RPC Client | COMPLETE |
| T2.2 | Transaction Validator | COMPLETE |
| T2.3 | ERC20 Transfer Parser | COMPLETE |
| T3.1 | EIP-712 Signature Verification | COMPLETE |
| T3.2 | Deterministic Secret Generation | COMPLETE |
| T3.3 | Aztec Authwit Generation | COMPLETE |
| T4.1 | Server Framework Setup | COMPLETE |
| T4.2 | Request Validation Middleware | COMPLETE |
| T4.3 | Rate Limiting Middleware | COMPLETE |
| T4.4 | Authwit Request Handler | COMPLETE |
| T4.5 | Error Handling Middleware | COMPLETE |
| T5.1 | Unit Tests | COMPLETE |
| T5.2 | Integration Tests | PARTIAL |
| T5.3 | End-to-End Tests | NOT STARTED |

### P1 (Nice to Have) — Production Readiness
| Task | Description | Status |
|------|-------------|--------|
| T6.1 | Docker Configuration | NOT STARTED |
| T6.2 | CI/CD Pipeline | NOT STARTED |
| T6.3 | Environment Configuration | NOT STARTED |
| T7.1 | Metrics Collection | NOT STARTED |
| T7.2 | Alerting Rules | NOT STARTED |
| T7.3 | Structured Logging | COMPLETE |

---

## Technical Notes

### Existing Code to Reuse
- `viem` — Already imported in `scripts/fund-fpc.ts` for EVM interactions
- Gas utilities — `src/ts/utils/gas.ts` for gas calculations
- Test harness patterns — `src/ts/test/harness.ts` for Aztec integration
- Vitest configuration — `vitest.config.ts` for test setup

### Key Dependencies
```json
{
  "dependencies": {
    "express": "^5.1.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.5.0",
    "zod": "^3.23.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "@noble/curves": "^1.4.0",
    "@noble/hashes": "^1.4.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

### Security Considerations
1. **SP Signing Key**: Must be securely stored (environment variable, secrets manager). Used for two purposes: (a) deterministic secret generation via ECDSA (secp256k1) and (b) as the `ownerSigningKey` for Aztec authwit Schnorr signing (`server.ts` passes `ownerSigningKey: config.spSigningKey`).
2. **No Revocation**: Once authwit generated, valid until hash nullified on Aztec
3. **Rate Limiting**: Protect against abuse and DoS (configurable via env vars). Key uses `req.ip` (Express trust proxy) with fallback to `req.socket.remoteAddress`.
4. **Proxy Trust**: `TRUST_PROXY` defaults to `false` for secure direct deployments. When behind a trusted reverse proxy (load balancer, CDN), set `TRUST_PROXY=true` or `1` so rate limiting uses the real client IP from `X-Forwarded-For`.
5. **Input Validation**: Strict validation of all request parameters (Zod schemas), including fixed-size formats for critical values (32-byte hex for `SP_SIGNING_KEY`, `FPC_ADDRESS`, `OWNER_ADDRESS`; 20-byte hex for EVM addresses)
6. **Error Messages**: Never expose internal details in error responses (`AppError` class)
7. **Cross-Chain Replay Prevention**: EIP-712 signatures are chain-bound via domain `chainId`, and transaction validation is performed against the chain-specific RPC selected by `evmChainId`. Secret derivation includes the sender address (`sha256(txHash || sender)`), providing per-sender isolation as defense-in-depth alongside the natural txHash uniqueness across chains.
8. **AZT Token Filtering**: Only transfers of the specific AZT token are accepted (prevents payment with arbitrary tokens)
9. **Cross-Sender Aggregation Prevention**: The sender address is recovered from the EIP-712 signature and passed as a `from` filter to the validator. Only AZT transfers where the `from` field matches the recovered signer are counted. Prevents a multi-sender transaction from crediting all transfer amounts to a single signer.
10. **Sensitive Data Redaction**: Pino logger redacts keys, signatures, secrets, and witnesses from log output

### Scalability Notes
- **Stateless Design**: No database = easy horizontal scaling
- **Deterministic Responses**: Can cache by `(chainId, txHash, sender)` if needed; secret derivation uses `sha256(txHash || sender)`, while `chainId` selects the RPC and EIP-712 domain.
- **RPC Load**: Viem transport includes retry logic (3 retries, 1s delay, 30s timeout)
- **Rate Limiting**: Per-IP via `req.ip` (when `TRUST_PROXY` enabled) or `req.socket.remoteAddress`. Set `TRUST_PROXY` when behind a reverse proxy.

---

## Verification Checklist

### Functional Verification
- [ ] Same (chainId, txHash, sender) returns identical response (determinism)
- [ ] Same txHash on different chainIds is handled safely via chain-specific RPC validation, EIP-712 domain separation, and sender-bound secret derivation
- [ ] Invalid signature rejected
- [ ] Unfinalized tx rejected
- [ ] Wrong recipient rejected
- [ ] Non-AZT token transfers rejected
- [ ] Zero-amount transfers rejected (INVALID_AMOUNT)
- [ ] Multi-sender transactions only credit transfers from the recovered EIP-712 signer (cross-sender aggregation prevented)
- [ ] Valid request returns complete authwit
- [ ] Authwit can be used to mint on Aztec

### Performance Verification
- [ ] Response time < 2s for valid requests
- [ ] Handles 100 concurrent requests
- [ ] Graceful degradation under load

### Security Verification
- [ ] No sensitive data in logs (redaction working)
- [ ] Rate limiting effective
- [ ] SP key not exposed in responses
- [ ] Error messages don't leak internals

---

## Appendix: API Reference

### POST /api/v1/authwit/request

**Request**:
```json
{
  "evmTxHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "evmChainId": 8453,
  "signature": "0x..."
}
```

**Success Response** (200):
```json
{
  "amount": "1000000000000000000",
  "secret": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "authwit": {
    "innerHash": "0x...",
    "outerHash": "0x...",
    "witness": ["0x...", "0x..."]
  }
}
```

**Error Response** (4xx/5xx):
```json
{
  "error": "TX_NOT_FINALIZED",
  "message": "Transaction has 5 confirmations, required 12",
  "details": {
    "confirmations": 5,
    "required": 12
  }
}
```

### GET /health

**Response** (200):
```json
{
  "status": "ok",
  "version": "1.0.0",
  "chains": [8453, 84532]
}
```

---

## Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.0 | February 2026 | Initial specification |
| 2.0 | February 2026 | Simplified secret generation to sign txHash directly (deterministic ECDSA via RFC 6979, `r` component mod BN254 Fr). Removed domain separator and chainId from secret derivation. Updated code snippets and design notes. |
| 2.1 | 2026-02-10 | Secret generation now signs `sha256(chainId \|\| txHash)` instead of raw `txHash`. `generateSecret(txHash)` signature changed to `generateSecret(txHash, chainId)`. ChainId is encoded as 4-byte big-endian and prepended to txHash before SHA-256 hashing. Provides explicit cross-chain replay prevention in secret derivation as defense-in-depth. Updated Task 3.2, Task 4.4 handler flow, security considerations, and verification checklist. |
| 2.2 | 2026-02-11 | Reverted secret derivation to txHash-only by design: `secret = sign(txHash, spKey).r % Fr.MODULUS`. Updated Task 3.2 acceptance criteria and code snippets, Task 4.4 handler flow, security considerations, and verification checklist to remove chainId from secret derivation while retaining chain-bound EIP-712 verification. |
| 2.3 | 2026-02-11 | Added `TRUST_PROXY` config (default: false). Server sets Express trust proxy from config instead of hardcoded value. Rate limiter key uses `req.ip` with fallback to `req.socket.remoteAddress`. Updated config schema, env vars, rate limiting, security considerations, and deployment guidance. |
| 2.4 | 2026-02-11 | Aligned documentation and runtime behavior: updated remaining Fastify references to Express, documented fixed-size validation requirements for critical config values, made `AZTEC_CHAIN_ID` required for authwit generation (no default chainId), and added `TX_REVERTED` semantics to transaction validation/error tables. |
| 2.5 | 2026-02-11 | Corrected Authwit Hash Computation: inner_hash is `H(amount, secret)` only (no fpcAddress or selector per custom authwit design). Updated Task 3.3 implementation snippet and Authwit Hash Computation section to match implementation. |
| 2.6 | 2026-02-11 | EIP-712 sender verification now checks against the token sender (Transfer event `from` field) instead of the transaction origin (`receipt.from` / `tx.origin`). This means the signer must be the address that actually sent the AZT tokens, not the address that submitted the transaction. Updated Task 3.1, Task 4.4 handler flow and note, error code description, and `ValidatedTransaction` code snippet. |
| 2.7 | 2026-02-11 | Security hardening: validator now pins sender to first matching AZT transfer and sums only same-sender transfers, preventing cross-sender amount aggregation. Updated Task 2.2 acceptance criteria and validation steps, Task 4.4 handler flow, security considerations, and verification checklist. |
| 2.8 | 2026-02-11 | Corrected sender filtering description: sender is recovered from EIP-712 signature (via `recoverClaimRequestSigner`) and passed as `from` filter to the validator — not "pinned to first matching transfer". Removed `verifyClaimRequestSignature` from Task 3.1 (only `recoverClaimRequestSigner` and `getTypedDataForSigning` exist). Updated `ValidateTransactionOptions` to include `from` and `minAmount` with return type `{ amount: bigint }`. Updated `findFeeCollectorTransfers` signature to accept `from` parameter. Rewrote Task 4.4 handler flow to show recover-then-validate pattern matching actual implementation. Updated error code descriptions, security consideration #9, and verification checklist. |
| 2.9 | 2026-02-12 | Secret derivation now includes sender address: `secret = sign(sha256(txHash \|\| sender), spKey).r % Fr.MODULUS`. Function signature changed from `generateSecret(txHash: Hex)` to `generateSecret(txHash: Hex, sender: Address)`. The 32-byte txHash is concatenated with the 20-byte sender address (recovered from EIP-712 signature) and SHA-256'd to produce the ECDSA signing input. Provides per-sender secret isolation. Updated Executive Summary, Task 3.2 (acceptance criteria, code snippet, design notes), Task 4.4 handler flow, security considerations #7, scalability notes, and verification checklist. |
