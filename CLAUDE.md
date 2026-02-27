# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Aztec Fee Payment — a Metered Fee Payment Contract (FPC) for Aztec that sponsors transaction fees using internal balances. Includes a Noir smart contract, a TypeScript SDK (published as `@defi-wonderland/aztec-fee-payment`), and an off-chain agent (Express server) that validates EVM transactions and generates authwits for cross-chain fee sponsorship.

## Spec Guardian

The tech design documents in `docs/` are the **source of truth** for this project:
- **PRD**: `docs/Fee Payment Contract (FPC) — Product Requirements.md`

All code changes MUST stay aligned with these documents. Two mandatory checks enforce this:
  
### 1. Pre-Change Validation (BLOCKING)

Before implementing any user-requested code change, launch a read-only `general-purpose` subagent that reads both docs and classifies the proposed change as:
- **ALIGNED** — explicitly described or directly implied by the spec
- **CONTRADICTION** — conflicts with a specific decision/requirement/constraint (must quote the section)
- **EXTENSION** — adds behavior, fields, endpoints, or flows not covered by either doc

**If ALIGNED**: proceed with implementation.
**If CONTRADICTION or EXTENSION**: use `AskUserQuestion` with options: (1) "Proceed and update docs after", (2) "Abort", (3) "Modify approach". Do NOT implement without asking.

Skip this check for: refactors with no behavior change, test-only changes, formatting, dependency bumps.

### 2. Post-Change Doc Sync (AUTOMATIC)

After any code change that affects contract logic, SDK public API, agent behavior/config/endpoints, error codes, or security properties, launch a `general-purpose` subagent (with edit permissions) that:
1. Reads both docs and identifies sections made outdated by the change
2. Edits only affected sections (requirements tables, status fields, code examples, API specs, schemas, prose)
3. Bumps the version in the Version History table (minor for features/behavior changes, patch for clarifications) with today's date
4. Returns a summary of all doc edits — relay this summary to the user

## Prerequisites

- Node.js >= 22, Yarn 1.22.22 (corepack)
- Aztec CLI v3.0.0-devnet.6-patch.1: `curl -s install.aztec.network | NON_INTERACTIVE=1 BIN_PATH=$HOME/.aztec/bin bash -s`
- Docker (for Aztec sandbox)
- Foundry (forge, cast, anvil) for Solidity development

## Commands

```bash
yarn install          # Install dependencies (uses Yarn workspaces)

# Full rebuild (clean + compile Noir + generate TS bindings)
yarn ccc

# Individual steps
yarn compile          # aztec compile (Noir contracts)
yarn codegen          # aztec codegen target --outdir src/artifacts

# Build TS package (compile + codegen + tsc)
yarn build

# Tests — integration tests auto-start/stop the sandbox via vitest globalSetup
yarn test             # all tests (Noir + JS)
yarn test:nr          # Noir unit tests only (aztec test)
yarn test:js          # JS integration tests (vitest, auto-manages sandbox)

# Run a single Noir test
aztec test --package metered_contract <test_name>

# Agent tests (separate vitest config, no sandbox needed)
yarn test:agent

# Run a single test file
npx vitest run src/ts/test/metered.test.ts
npx vitest run --config vitest.agent.config.ts src/ts/agent/test/secret.test.ts

# Off-chain agent dev server
yarn agent:dev

# Deployment
yarn deploy:devnet    # Deploy to devnet
yarn deploy:testnet   # Deploy to testnet
yarn deploy:dry-run   # Dry run

# Solidity (Foundry)
yarn compile:sol     # forge build
yarn test:sol        # forge test -vvv

# Formatting
yarn lint:prettier
```

## Architecture

### Solidity Contracts (`src/sol/`)

EVM-side TopUp contract built with Foundry (config in `foundry.toml`, dependencies in `lib/`):

- **`TopUp.sol`** — Handles AZT token top-ups for Aztec FPC sponsorship. Users call `topUp(from, amount)` which transfers AZT to the fee recipient and emits a `TopUp(from, amount)` event. Two-step fee recipient transfer (`setPendingFeeRecipient` + `acceptFeeRecipient`).
- **`interfaces/ITopUp.sol`** — Interface with events, errors, and function signatures.
- **`test/TopUp.t.sol`** — Foundry unit tests.

### Noir Contracts (`src/nr/`)

Two Noir packages (workspace defined in root `Nargo.toml`):

- **`metered_contract`** — The FPC. Storage is a single `Owned<BalanceSet>` mapping accounts to private note-based balances. Key functions:
  - `pay_fee()` — Deducts max gas cost, no refund (simpler, cheaper proofs)
  - `pay_fee_exact()` — Deducts max gas cost, refunds unused gas in teardown via partial notes
  - `mint(account, amount)` — Permissionless mint (Phase 1 only, no access control)
  - `_refund(max_gas_cost, partial_note)` — Public teardown function, only callable by self
  - `balance_of(account)` — Unconstrained view
- **`counter_contract`** — Test utility contract for benchmarks

### TypeScript SDK (`src/ts/`)

Published as `@defi-wonderland/aztec-fee-payment` with four export paths:
- `.` — Main: `MeteredContract`, `MeteredFeePaymentMethod`, `MeteredExactFeePaymentMethod`, gas utils, deploy helper
- `./artifacts` — Generated contract bindings
- `./fee-payment-methods` — `MeteredFeePaymentMethod` (no refund) and `MeteredExactFeePaymentMethod` (with teardown refund)
- `./utils` — Gas calculation helpers (`maxGasCostFor`, `maxFeesPerGasFromBaseFees`), deploy helper

### Off-Chain Agent (`src/ts/agent/`)

Express server that validates EVM token transfers and returns Aztec authwits for fee sponsorship:

- **Config** (`config/`) — Env-based via Zod. Required: `SP_SIGNING_KEY`, `FPC_ADDRESS`, `OWNER_ADDRESS`, plus `CHAIN_<id>_*` groups
- **Services**:
  - `evm/` — `MultiChainEVMClient` validates EVM transactions, `parser` filters by recipient + `aztTokenAddress`, `validator` checks confirmations/amounts
  - `crypto/` — `SecretGenerator` (deterministic ECDSA on txHash, extracts r mod BN254 Fr), `AuthwitGenerator` (Schnorr-based inner/outer hash), `eip712` types
- **Routes** — Single endpoint: `POST /api/v1/authwit/request`
- **Middleware** — Pino logger, Zod validation, rate limiting, error handler

### Test Setup

- **Integration tests** (`vitest.config.ts`) — `globalSetup` in `vitest.setup.ts` auto-starts/stops Aztec sandbox (Docker required). 200s timeouts. Single fork, no parallelism. Must inline `/@aztec/`, `/@noble/`, `/@scure/`, `/viem/` in `server.deps`.
- **Agent tests** (`vitest.agent.config.ts`) — Separate config, no sandbox, 30s timeout. Also inlines `/zod/`, `/pino/`.

### Deployment (`scripts/`, `config/`)

- `deploy.ts` — CLI with `--network` flag (devnet/testnet/local-network) and `--dry-run`
- `config/config.ts` — Deployment config (node URLs, salts, retry options)
- `deployments/` — Stored deployment addresses per network
- `fund-fpc.ts` — Fund deployed FPC with gas tokens

## Key Patterns

- Contract uses `try_sub` with `max_notes = 1` for single-note optimization (faster proofs)
- Partial notes (`UintNote::partial`) enable private teardown refunds in `pay_fee_exact`
- `set_as_fee_payer()` + `end_setup()` is the required FPC pattern for Aztec fee sponsorship
- Commits use conventional commits (`@commitlint/config-conventional`)

## Vitest Gotchas

- `encodeEventLog` does NOT exist in the bundled viem — use `encodeEventTopics` + `encodeAbiParameters`
- `vi.mock` for classes must use actual `class` syntax in vitest v4
- Aztec Schnorr signatures use random nonces (NOT deterministic)
- Both vitest configs require a `@noble/hashes/utils` resolve alias pointing to the exact ESM file — without it, CI may resolve a nested version missing the `anumber` export
