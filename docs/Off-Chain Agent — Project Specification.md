# Off-Chain Agent — Project Specification

**Version**: 1.0
**Status**: Draft
**Project**: Fee Payment Contract (FPC) Off-Chain Service
**Date**: February 2026

---

## Executive Summary

This document specifies the complete implementation plan for the FPC Off-Chain Agent — a stateless, privacy-preserving API service that enables users to claim wFJ (wrapped Fee Juice) on Aztec after paying on EVM chains.

### Core Responsibilities
1. Verify EVM payment transactions
2. Generate deterministic secrets from payment txHash
3. Create Aztec authwits for `mint(amount, secret)` operations
4. Serve a stateless REST API

### Key Design Constraints
- **Stateless**: No database required; same request = same response
- **Deterministic**: `secret = SP.sign(txHash)` is reproducible
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
│  ┌──────────────┐    │  ┌────────────┐  ┌────────────┐  ┌───────────┐  │   │
│  │   SP Signing │◄───│  │  EIP-712   │  │   EVM Tx   │  │  Authwit  │  │   │
│  │     Key      │    │  │ Verifier   │  │  Validator │  │ Generator │  │   │
│  └──────────────┘    │  └────────────┘  └────────────┘  └───────────┘  │   │
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

## Milestones & Timeline

| Milestone | Description | Priority | Dependencies |
|-----------|-------------|----------|--------------|
| **M1** | Project Foundation | P0 | None |
| **M2** | EVM Integration Layer | P0 | M1 |
| **M3** | Cryptographic Core | P0 | M1 |
| **M4** | API Server | P0 | M2, M3 |
| **M5** | Integration Testing | P0 | M4 |
| **M6** | Deployment & Operations | P1 | M5 |
| **M7** | Monitoring & Observability | P1 | M6 |

---

## Milestone 1: Project Foundation

**Goal**: Establish project structure, tooling, and configuration management.

### Task 1.1: Project Scaffolding
**Priority**: P0
**Estimate**: Foundation setup

**Acceptance Criteria**:
- [ ] Create `src/ts/agent/` directory structure
- [ ] Configure TypeScript for new module (extend existing tsconfig)
- [ ] Add package.json scripts for agent development
- [ ] Set up ESLint/Prettier configuration (match existing patterns)

**Directory Structure**:
```
src/ts/agent/
├── index.ts                 # Main entry point
├── server.ts                # HTTP server setup
├── config/
│   ├── index.ts             # Configuration loader
│   ├── schema.ts            # Zod validation schemas
│   └── chains.ts            # Supported chain configs
├── services/
│   ├── evm/                  # EVM integration
│   ├── crypto/               # Cryptographic operations
│   └── authwit/              # Authwit generation
├── routes/
│   └── authwit.ts           # /api/v1/authwit/* routes
├── middleware/
│   ├── rateLimit.ts         # Rate limiting
│   ├── validation.ts        # Request validation
│   └── errorHandler.ts      # Error handling
└── types/
    └── index.ts             # TypeScript type definitions
```

### Task 1.2: Configuration Management
**Priority**: P0
**Dependencies**: Task 1.1

**Acceptance Criteria**:
- [ ] Environment variable loading with dotenv
- [ ] Configuration validation with Zod
- [ ] Support for multiple environments (local, devnet, testnet, mainnet)
- [ ] Secure handling of SP signing key

**Configuration Schema**:
```typescript
interface AgentConfig {
  // Server
  port: number;                          // Default: 3000
  host: string;                          // Default: '0.0.0.0'

  // Supported EVM Chains
  chains: {
    [chainId: number]: {
      name: string;
      rpcUrl: string;
      feeCollectorAddress: Address;      // Aztec Labs fee collector
      requiredConfirmations: number;     // Finality threshold
    };
  };

  // Security
  spSigningKey: Hex;                     // SP private key for secret generation

  // Rate Limiting
  rateLimit: {
    windowMs: number;                    // Default: 60000 (1 minute)
    maxRequests: number;                 // Default: 100
  };

  // Aztec
  aztec: {
    fpcAddress: AztecAddress;            // FPC contract address
    ownerAddress: AztecAddress;          // Owner account address
  };
}
```

**Environment Variables**:
```bash
# Required
SP_SIGNING_KEY=0x...                     # 32-byte hex private key
FPC_ADDRESS=0x...                        # Aztec FPC contract address
OWNER_ADDRESS=0x...                      # Aztec owner address

# Optional (with defaults)
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# Per-chain configuration
CHAIN_8453_RPC_URL=https://base.llamarpc.com
CHAIN_8453_FEE_COLLECTOR=0x...
CHAIN_8453_CONFIRMATIONS=12

CHAIN_1_RPC_URL=https://eth.llamarpc.com
CHAIN_1_FEE_COLLECTOR=0x...
CHAIN_1_CONFIRMATIONS=32
```

### Task 1.3: Logging Infrastructure
**Priority**: P0
**Dependencies**: Task 1.1

**Acceptance Criteria**:
- [ ] Structured JSON logging (pino or similar)
- [ ] Request ID propagation
- [ ] Log levels: debug, info, warn, error
- [ ] Sensitive data redaction (keys, signatures)

---

## Milestone 2: EVM Integration Layer

**Goal**: Build robust EVM transaction verification capabilities.

### Task 2.1: Multi-Chain RPC Client
**Priority**: P0
**Dependencies**: M1

**Acceptance Criteria**:
- [ ] Support multiple EVM chains (Ethereum, Base, Arbitrum, etc.)
- [ ] Use viem for RPC interactions (already in project)
- [ ] Connection pooling and retry logic
- [ ] Graceful fallback for RPC failures

**Implementation**:
```typescript
// src/ts/agent/services/evm/client.ts
import { createPublicClient, http, Chain } from 'viem';

interface EVMClient {
  getTransaction(txHash: Hex): Promise<Transaction | null>;
  getTransactionReceipt(txHash: Hex): Promise<TransactionReceipt | null>;
  getBlockNumber(): Promise<bigint>;
  isFinalized(txHash: Hex, requiredConfirmations: number): Promise<boolean>;
}

class MultiChainEVMClient {
  private clients: Map<number, PublicClient>;

  constructor(config: ChainConfig[]) { ... }

  getClientForChain(chainId: number): EVMClient { ... }
}
```

### Task 2.2: Transaction Validator
**Priority**: P0
**Dependencies**: Task 2.1

**Acceptance Criteria**:
- [ ] Fetch transaction by hash
- [ ] Verify transaction succeeded (status = 1)
- [ ] Verify transaction is finalized (enough confirmations)
- [ ] Extract transfer amount from transaction data or logs
- [ ] Verify recipient matches fee collector address

**Validation Flow**:
```typescript
// src/ts/agent/services/evm/validator.ts

interface TransactionValidationResult {
  valid: boolean;
  error?: 'TX_NOT_FOUND' | 'TX_FAILED' | 'TX_NOT_FINALIZED' | 'WRONG_RECIPIENT' | 'INVALID_AMOUNT';
  transaction?: {
    hash: Hex;
    from: Address;
    to: Address;
    amount: bigint;
    blockNumber: bigint;
    confirmations: bigint;
  };
}

async function validateTransaction(
  client: EVMClient,
  txHash: Hex,
  expectedRecipient: Address,
  requiredConfirmations: number
): Promise<TransactionValidationResult>;
```

### Task 2.3: ERC20 Transfer Parser
**Priority**: P0
**Dependencies**: Task 2.1

**Acceptance Criteria**:
- [ ] Parse ERC20 Transfer events from transaction receipt
- [ ] Extract: from, to, amount
- [ ] Handle multiple transfers in single transaction
- [ ] Support both direct transfers and DEX swaps (final transfer to fee collector)

**Implementation**:
```typescript
// src/ts/agent/services/evm/parser.ts

const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface ParsedTransfer {
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
}

function parseTransferEvents(receipt: TransactionReceipt): ParsedTransfer[];

function findFeeCollectorTransfer(
  transfers: ParsedTransfer[],
  feeCollectorAddress: Address
): ParsedTransfer | null;
```

---

## Milestone 3: Cryptographic Core

**Goal**: Implement EIP-712 verification and deterministic secret generation.

### Task 3.1: EIP-712 Signature Verification
**Priority**: P0
**Dependencies**: M1

**Acceptance Criteria**:
- [ ] Implement EIP-712 domain and types as specified in PRD
- [ ] Recover signer address from signature
- [ ] Validate recovered address matches transaction sender
- [ ] Support multiple chain IDs in domain

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

function recoverClaimRequestSigner(
  message: ClaimRequestMessage,
  signature: Hex,
  chainId: number
): Address;

function verifyClaimRequestSignature(
  message: ClaimRequestMessage,
  signature: Hex,
  expectedSigner: Address,
  chainId: number
): boolean;
```

### Task 3.2: Deterministic Secret Generation
**Priority**: P0
**Dependencies**: M1

**Acceptance Criteria**:
- [ ] Generate deterministic secret: `secret = SP.sign(txHash)`
- [ ] Same txHash always produces same secret
- [ ] Secret is a valid Aztec field element (Fr)
- [ ] Secure key management for SP signing key

**Implementation**:
```typescript
// src/ts/agent/services/crypto/secret.ts

import { Fr } from '@aztec/aztec.js';
import { secp256k1 } from '@noble/curves/secp256k1';

class SecretGenerator {
  private signingKey: Uint8Array;

  constructor(spSigningKeyHex: Hex) {
    this.signingKey = hexToBytes(spSigningKeyHex);
  }

  /**
   * Generate deterministic secret from txHash
   * secret = sign(txHash) truncated to Fr field
   */
  generateSecret(txHash: Hex): Fr {
    const messageHash = keccak256(txHash);
    const signature = secp256k1.sign(messageHash, this.signingKey);
    // Convert signature to Fr (truncate to field size)
    return Fr.fromBuffer(signature.toCompactRawBytes().slice(0, 32));
  }
}
```

### Task 3.3: Aztec Authwit Generation
**Priority**: P0
**Dependencies**: Task 3.2

**Acceptance Criteria**:
- [ ] Generate custom authwit for `mint(amount, secret)` without caller binding
- [ ] Authwit format compatible with FPC contract validation
- [ ] Include all required witness data for PXE storage

**Implementation**:
```typescript
// src/ts/agent/services/authwit/generator.ts

import { Fr, AztecAddress } from '@aztec/aztec.js';

interface MintAuthwit {
  amount: bigint;
  secret: Fr;
  innerHash: Fr;
  outerHash: Fr;
  witness: AuthWitness;
}

class AuthwitGenerator {
  private ownerSigningKey: Uint8Array;
  private fpcAddress: AztecAddress;

  constructor(config: AuthwitConfig) { ... }

  /**
   * Generate authwit for mint(amount, secret)
   * Custom authwit skips caller binding - allows any address to claim
   */
  async generateMintAuthwit(
    amount: bigint,
    secret: Fr
  ): Promise<MintAuthwit> {
    // 1. Compute inner_hash = H(FPC_ADDRESS, selector, [amount, secret])
    // 2. Compute outer_hash = H(OWNER_ADDRESS, inner_hash)
    // 3. Sign outer_hash with owner key
    // 4. Return complete witness structure
  }
}
```

**Authwit Hash Computation** (from Aztec protocol):
```
inner_hash = poseidon2(
  FPC_ADDRESS,
  FUNCTION_SELECTOR,  // selector for mint(amount, secret)
  poseidon2(amount, secret)  // args hash
)

outer_hash = poseidon2(
  OWNER_ADDRESS,
  inner_hash
)

witness = owner.sign(outer_hash)
```

---

## Milestone 4: API Server

**Goal**: Build the REST API server with all endpoints and middleware.

### Task 4.1: Server Framework Setup
**Priority**: P0
**Dependencies**: M1

**Acceptance Criteria**:
- [ ] Set up Fastify or Express server
- [ ] Configure CORS for frontend clients
- [ ] Health check endpoint (`GET /health`)
- [ ] Graceful shutdown handling

**Implementation**:
```typescript
// src/ts/agent/server.ts

import Fastify from 'fastify';

const app = Fastify({
  logger: true,
  requestIdHeader: 'x-request-id',
});

// Health check
app.get('/health', async () => ({ status: 'ok' }));

// API routes
app.register(authwitRoutes, { prefix: '/api/v1' });

export async function startServer(config: AgentConfig) {
  await app.listen({ port: config.port, host: config.host });
}
```

### Task 4.2: Request Validation Middleware
**Priority**: P0
**Dependencies**: Task 4.1

**Acceptance Criteria**:
- [ ] Validate request body schema with Zod
- [ ] Validate txHash format (32 bytes hex)
- [ ] Validate chainId is supported
- [ ] Validate signature format (65 bytes hex)
- [ ] Return structured error responses

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
  secret: string;      // 0x-prefixed 32-byte hex (Fr)
  authwit: {
    innerHash: string;
    outerHash: string;
    witness: string[];
  };
}

// Error Response
interface ErrorResponse {
  error: 'INVALID_SIGNATURE' | 'TX_NOT_FOUND' | 'TX_NOT_FINALIZED' |
         'WRONG_RECIPIENT' | 'INVALID_CHAIN' | 'INVALID_REQUEST';
  message: string;
  details?: Record<string, unknown>;
}
```

### Task 4.3: Rate Limiting Middleware
**Priority**: P0
**Dependencies**: Task 4.1

**Acceptance Criteria**:
- [ ] Rate limit by IP address
- [ ] Configurable window and max requests
- [ ] Return 429 with Retry-After header
- [ ] Optional: Rate limit by EVM address (recovered from signature)

**Implementation**:
```typescript
// src/ts/agent/middleware/rateLimit.ts

interface RateLimitConfig {
  windowMs: number;     // Time window in ms
  maxRequests: number;  // Max requests per window
  keyGenerator?: (req: Request) => string;  // Custom key function
}

// Default: rate limit by IP
// Optional: rate limit by recovered signer address
```

### Task 4.4: Authwit Request Handler
**Priority**: P0
**Dependencies**: M2, M3, Task 4.2

**Acceptance Criteria**:
- [ ] Implement `POST /api/v1/authwit/request` endpoint
- [ ] Full request validation and error handling
- [ ] Stateless processing (same input = same output)
- [ ] Comprehensive logging for debugging

**Handler Flow**:
```typescript
// src/ts/agent/routes/authwit.ts

async function handleAuthwitRequest(
  request: AuthwitRequestBody
): Promise<AuthwitResponse | ErrorResponse> {
  // 1. VALIDATE REQUEST
  const validation = validateRequest(request);
  if (!validation.valid) {
    return { error: 'INVALID_REQUEST', message: validation.error };
  }

  // 2. VERIFY EIP-712 SIGNATURE
  const signer = recoverClaimRequestSigner(
    { txHash: request.evmTxHash },
    request.signature,
    request.evmChainId
  );

  // 3. FETCH & VALIDATE TRANSACTION
  const client = evmClients.getClientForChain(request.evmChainId);
  const txResult = await validateTransaction(
    client,
    request.evmTxHash,
    config.chains[request.evmChainId].feeCollectorAddress,
    config.chains[request.evmChainId].requiredConfirmations
  );

  if (!txResult.valid) {
    return { error: txResult.error, message: '...' };
  }

  // 4. VALIDATE SIGNER == TX SENDER
  if (signer.toLowerCase() !== txResult.transaction.from.toLowerCase()) {
    return { error: 'INVALID_SIGNATURE', message: 'Signer does not match transaction sender' };
  }

  // 5. GENERATE DETERMINISTIC SECRET
  const secret = secretGenerator.generateSecret(request.evmTxHash);

  // 6. GENERATE AUTHWIT
  const authwit = await authwitGenerator.generateMintAuthwit(
    txResult.transaction.amount,
    secret
  );

  // 7. RETURN RESPONSE
  return {
    amount: txResult.transaction.amount.toString(),
    secret: secret.toString(),
    authwit: {
      innerHash: authwit.innerHash.toString(),
      outerHash: authwit.outerHash.toString(),
      witness: authwit.witness.map(w => w.toString()),
    },
  };
}
```

### Task 4.5: Error Handling Middleware
**Priority**: P0
**Dependencies**: Task 4.1

**Acceptance Criteria**:
- [ ] Catch all unhandled errors
- [ ] Return structured error responses
- [ ] Log errors with request context
- [ ] Never expose internal error details to clients

**Error Codes**:
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request body |
| `INVALID_SIGNATURE` | 400 | EIP-712 signature invalid or signer mismatch |
| `TX_NOT_FOUND` | 404 | Transaction hash not found on chain |
| `TX_NOT_FINALIZED` | 400 | Transaction not yet finalized |
| `WRONG_RECIPIENT` | 400 | Transfer not to fee collector address |
| `INVALID_CHAIN` | 400 | Chain ID not supported |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Milestone 5: Integration Testing

**Goal**: Comprehensive test coverage for all components.

### Task 5.1: Unit Tests
**Priority**: P0
**Dependencies**: M2, M3

**Test Coverage**:
```
tests/unit/
├── evm/
│   ├── client.test.ts           # RPC client tests
│   ├── validator.test.ts        # Transaction validation
│   └── parser.test.ts           # ERC20 transfer parsing
├── crypto/
│   ├── eip712.test.ts           # Signature verification
│   ├── secret.test.ts           # Secret generation
│   └── authwit.test.ts          # Authwit generation
└── routes/
    └── authwit.test.ts          # Handler unit tests
```

**Acceptance Criteria**:
- [ ] 90%+ code coverage
- [ ] Mock all external dependencies (RPC, etc.)
- [ ] Test edge cases and error paths
- [ ] Determinism tests (same input = same output)

### Task 5.2: Integration Tests
**Priority**: P0
**Dependencies**: M4

**Test Scenarios**:
```typescript
// tests/integration/authwit-flow.test.ts

describe('Authwit Request Flow', () => {
  it('returns valid authwit for legitimate payment', async () => {
    // 1. Create mock EVM transaction
    // 2. Sign EIP-712 claim request
    // 3. POST to /api/v1/authwit/request
    // 4. Verify response contains valid authwit
  });

  it('returns same response for same txHash (idempotent)', async () => {
    // 1. Make request with txHash X
    // 2. Make same request again
    // 3. Verify responses are identical
  });

  it('rejects invalid signature', async () => {
    // 1. Create valid txHash
    // 2. Sign with different key
    // 3. Verify INVALID_SIGNATURE error
  });

  it('rejects unfinalized transaction', async () => {
    // 1. Mock transaction with 0 confirmations
    // 2. Verify TX_NOT_FINALIZED error
  });

  it('rejects wrong recipient', async () => {
    // 1. Mock transfer to different address
    // 2. Verify WRONG_RECIPIENT error
  });
});
```

### Task 5.3: End-to-End Tests
**Priority**: P0
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

### Task 7.1: Metrics Collection
**Priority**: P1
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
**Priority**: P1
**Dependencies**: Task 7.1

**Alerts**:
- High error rate (>5% of requests failing)
- High latency (p99 > 5s)
- RPC failures
- Rate limit exhaustion

### Task 7.3: Structured Logging
**Priority**: P1
**Dependencies**: M4

**Log Format**:
```json
{
  "level": "info",
  "timestamp": "2026-02-05T12:00:00Z",
  "requestId": "abc-123",
  "message": "Authwit generated",
  "chainId": 8453,
  "txHash": "0x...",
  "amount": "1000000000000000000",
  "duration_ms": 150
}
```

---

## Task Dependency Graph

```
M1: Project Foundation
├── T1.1: Project Scaffolding
├── T1.2: Configuration Management ──────┐
└── T1.3: Logging Infrastructure ────────┤
                                         │
M2: EVM Integration Layer ◄──────────────┤
├── T2.1: Multi-Chain RPC Client         │
├── T2.2: Transaction Validator          │
└── T2.3: ERC20 Transfer Parser          │
                                         │
M3: Cryptographic Core ◄─────────────────┘
├── T3.1: EIP-712 Signature Verification
├── T3.2: Deterministic Secret Generation
└── T3.3: Aztec Authwit Generation
                    │
                    ▼
M4: API Server ◄────┴────────────────────
├── T4.1: Server Framework Setup
├── T4.2: Request Validation Middleware
├── T4.3: Rate Limiting Middleware
├── T4.4: Authwit Request Handler
└── T4.5: Error Handling Middleware
                    │
                    ▼
M5: Integration Testing
├── T5.1: Unit Tests
├── T5.2: Integration Tests
└── T5.3: End-to-End Tests
                    │
                    ▼
M6: Deployment & Operations
├── T6.1: Docker Configuration
├── T6.2: CI/CD Pipeline
└── T6.3: Environment Configuration
                    │
                    ▼
M7: Monitoring & Observability
├── T7.1: Metrics Collection
├── T7.2: Alerting Rules
└── T7.3: Structured Logging
```

---

## Priority Summary

### P0 (Must Have) — Core Functionality
| Task | Description |
|------|-------------|
| T1.1 | Project Scaffolding |
| T1.2 | Configuration Management |
| T1.3 | Logging Infrastructure |
| T2.1 | Multi-Chain RPC Client |
| T2.2 | Transaction Validator |
| T2.3 | ERC20 Transfer Parser |
| T3.1 | EIP-712 Signature Verification |
| T3.2 | Deterministic Secret Generation |
| T3.3 | Aztec Authwit Generation |
| T4.1 | Server Framework Setup |
| T4.2 | Request Validation Middleware |
| T4.3 | Rate Limiting Middleware |
| T4.4 | Authwit Request Handler |
| T4.5 | Error Handling Middleware |
| T5.1 | Unit Tests |
| T5.2 | Integration Tests |
| T5.3 | End-to-End Tests |

### P1 (Nice to Have) — Production Readiness
| Task | Description |
|------|-------------|
| T6.1 | Docker Configuration |
| T6.2 | CI/CD Pipeline |
| T6.3 | Environment Configuration |
| T7.1 | Metrics Collection |
| T7.2 | Alerting Rules |
| T7.3 | Structured Logging |

---

## Technical Notes

### Existing Code to Reuse
- `viem` — Already imported in `scripts/fund-fpc.ts` for EVM interactions
- Gas utilities — `src/ts/utils/gas.ts` for gas calculations
- Test harness patterns — `src/ts/test/harness.ts` for Aztec integration
- Vitest configuration — `vitest.config.ts` for test setup

### Key Dependencies to Add
```json
{
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/rate-limit": "^10.0.0",
    "zod": "^3.23.0",
    "pino": "^9.0.0",
    "@noble/curves": "^1.4.0",
    "@noble/hashes": "^1.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

### Security Considerations
1. **SP Signing Key**: Must be securely stored (environment variable, secrets manager)
2. **No Revocation**: Once authwit generated, valid until secret nullified on Aztec
3. **Rate Limiting**: Protect against abuse and DoS
4. **Input Validation**: Strict validation of all request parameters
5. **Error Messages**: Never expose internal details in error responses

### Scalability Notes
- **Stateless Design**: No database = easy horizontal scaling
- **Deterministic Responses**: Can cache by txHash if needed
- **RPC Load**: Consider RPC provider rate limits and failover

---

## Verification Checklist

### Functional Verification
- [ ] Same txHash returns identical response (determinism)
- [ ] Invalid signature rejected
- [ ] Unfinalized tx rejected
- [ ] Wrong recipient rejected
- [ ] Valid request returns complete authwit
- [ ] Authwit can be used to mint on Aztec

### Performance Verification
- [ ] Response time < 2s for valid requests
- [ ] Handles 100 concurrent requests
- [ ] Graceful degradation under load

### Security Verification
- [ ] No sensitive data in logs
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
  "chains": [1, 8453, 42161]
}
```
