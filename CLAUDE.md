# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Aztec Fee Payment — two Fee Payment Contracts (FPCs) for Aztec that sponsor transaction fees using internal balances. Includes Noir smart contracts, a TypeScript SDK (published as `@defi-wonderland/aztec-fee-payment`), and an off-chain agent (Express server) that validates EVM transactions and generates authwits for cross-chain fee sponsorship.

- **Metered FPC** (`src/nr/metered_contract/`) — Agent-based flow: users pay AZT on L1, off-chain agent validates and issues authwits, users mint internal wFJ on Aztec.
- **Bridged FPC** (`src/nr/bridged_contract/`) — Bridge-based flow: users bridge FJ directly via `FeeJuicePortal` to the FPC address, then call `mint` to convert the bridge claim into private wFJ. Fully private, no owner, no off-chain agent.

## Spec Guardian

The tech design documents in `docs/` are the **source of truth** for this project:
- **Metered FPC PRD**: `docs/metered-product-requirements.md`
- **Bridged FPC PRD**: `docs/bridged-product-requirements.md`

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
- Aztec CLI v4.0.0-devnet.2-patch.1: `curl -s install.aztec.network | NON_INTERACTIVE=1 BIN_PATH=$HOME/.aztec/bin bash -s`

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

# Tests — integration tests require a running Aztec local network
yarn test             # all tests (Noir + JS)
yarn test:nr          # Noir unit tests only (aztec test)
yarn test:js          # JS integration tests

# Run a single Noir test
aztec test --package metered_contract <test_name>

# Agent tests (separate vitest config, no local network needed)
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

# Formatting
yarn lint:prettier
```

## Architecture

### Noir Contracts (`src/nr/`)

Three Noir packages (workspace defined in root `Nargo.toml`):

- **`metered_contract`** — Agent-based FPC. Storage: `owner: DelayedPublicMutable` + `balances: Owned<BalanceSet>`. Key functions:
  - `pay_fee()` — Deducts max gas cost, no refund (simpler, cheaper proofs)
  - `pay_fee_exact()` — Deducts max gas cost, refunds unused gas in teardown via partial notes
  - `mint(account, amount, secret)` — Authorized mint via owner authwit
  - `mint_and_pay_fee(account, amount, secret)` — Cold-start: mint + self-sponsor in one tx
  - `_refund(max_gas_cost, partial_note)` — Public teardown function, only callable by self
  - `balance_of(account)` — Unconstrained view
- **`bridged_contract`** — Bridge-based FPC. Fully private (no public functions). Storage: `balances: Owned<BalanceSet>` only. Key functions:
  - `pay_fee()` — Deducts max gas cost, no refund
  - `mint(amount, salt, leaf_index)` — Proves prior `FeeJuice.claim` via nullifier existence, credits wFJ to claimer
  - `balance_of(account)` — Unconstrained view
  - Library methods: `derive_bridge_secret`, `get_bridge_gas_msg_hash`, `compute_feejuice_claim_nullifier`
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

- **Integration tests** (`vitest.config.ts`) — Requires a running Aztec local network (start manually before running). 200s timeouts. Single fork, no parallelism. Must inline `/@aztec/`, `/@noble/`, `/@scure/`, `/viem/` in `server.deps`.
- **Agent tests** (`vitest.agent.config.ts`) — Separate config, no local network, 30s timeout. Also inlines `/zod/`, `/pino/`.

### Deployment (`scripts/`, `config/`)

- `deploy.ts` — CLI with `--network` flag (devnet/testnet/local-network) and `--dry-run`
- `config/config.ts` — Deployment config (node URLs, salts, retry options)
- `deployments/` — Stored deployment addresses per network
- `fund-fpc.ts` — Fund deployed FPC with gas tokens

## Key Patterns

- Contract uses `try_sub` with `max_notes = 1` for single-note optimization (faster proofs)
- Partial notes (`UintNote::partial`) enable private teardown refunds in `pay_fee_exact` (Metered FPC only)
- `set_as_fee_payer()` + `end_setup()` is the required FPC pattern for Aztec fee sponsorship
- `mint` uses `assert_nullifier_exists` + `compute_nullifier_existence_request` to prove a prior `FeeJuice.claim` in private (Bridged FPC only)
- Commits use conventional commits (`@commitlint/config-conventional`)

## Vitest Gotchas

- `encodeEventLog` does NOT exist in the bundled viem — use `encodeEventTopics` + `encodeAbiParameters`
- `vi.mock` for classes must use actual `class` syntax in vitest v4
- Aztec Schnorr signatures use random nonces (NOT deterministic)
- Both vitest configs require a `@noble/hashes/utils` resolve alias pointing to the exact ESM file — without it, CI may resolve a nested version missing the `anumber` export
