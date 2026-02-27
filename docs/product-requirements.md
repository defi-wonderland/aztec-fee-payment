# Fee Payment Contract (FPC) — Product Requirements Document

**Version**: 4.1
**Status**: Active
**Current Phase**: Phase 2 (Authorized Mint with Authwit)
**Target Aztec Version**: 4.0.0-devnet.1-patch.0
**Audience**: Implementation Engineers
**Date**: February 2026

---

## Problem Statement

Users interacting with Aztec need Fee Juice (FJ) to pay for transaction costs, but acquiring and managing FJ directly creates significant UX friction, especially for non-sophisticated EVM users bridging from L1/L2 chains. Users must understand gas mechanics, bridge AZT tokens, and maintain FJ balances—all of which leak privacy and create cold-start problems (users cannot transact without FJ, but cannot get FJ without transacting).

**Who is affected**: All Aztec users, particularly those onboarding from Ethereum mainnet or L2 chains (Base, Arbitrum, etc.).

**Impact of not solving**: Poor onboarding experience, privacy leakage through direct FJ management, high barrier to entry for non-crypto-native users.

---

## Goals

1. **Enable gasless UX**: Users interact with Aztec without directly managing Fee Juice—they use internal balance (wFJ) that abstracts gas mechanics
2. **Preserve privacy**: Shared FPC increases anonymity set; users don't expose their Aztec address when topping up
3. **Minimize proving time**: Minimal gates overhead (sponsor with BalanceNote), prioritize lean transaction flows
4. **Support cold-start**: Users with zero FJ can claim and sponsor transactions atomically

---

## Non-Goals

1. **Zero-trust for L2->Aztec flow**: The trusted path accepts SP (Service Provider) trust for balance distribution.
2. **Zero-sum FJ accounting**: Dust accumulation in FPC is acceptable. We will NOT track perfect invariant `FPC.FJ_balance == FPC.wFJ_total_supply` for non-exact flows.
3. **Pay-per-use model**: Top-up is preferred over per-transaction payments due to privacy implications and SP online requirements.
4. **USD payments within Aztec**: Quote oracles on Aztec add significant gate overhead. Token->AZT conversion happens on EVM.

---

## User Stories

### Service Provider (SP) / FPC Deployer

**As an SP, I want to fund the FPC with Fee Juice so that users can sponsor their transactions.**

- Deploy FPC contract with `owner` address (the account contract that authorizes mints)
- Bridge AZT from L1 to Aztec
- Claim FJ from Fee Juice Portal into FPC
- Use own AccountContract to pay for claim transaction

**As an SP, I want to provide balance to users so they can sponsor transactions.**

- Run a stateless off-chain agent that verifies EVM TopUp events and returns `{ amount, secret, authwit }` to users
- Users call a minting function (`mint` or `mint_and_pay_fee`) on Aztec themselves — SP never learns their Aztec address
- Agent is deterministic and horizontally scalable (no database required)

### End User

**As a user with wFJ balance, I want to sponsor my transactions without managing Fee Juice directly.**

- Use `MeteredFeePaymentMethod` for simple fee payment (max gas cost deducted, no refund)
- Use `MeteredExactFeePaymentMethod` for exact fee payment (refund of unused gas in teardown)
- FPC pays the actual transaction fee from its FJ balance

**As a user, I want to check my remaining fee balance before transacting.**

- Call `balance_of(account)` unconstrained view to query wFJ balance
- Balance is denominated in FJ units

---

## Requirements

### P0 — Must Have

### Noir Contract: Metered FPC

| Requirement | Acceptance Criteria | Status |
| --- | --- | --- |
| **Storage** | `owner: DelayedPublicMutable<AztecAddress, CONFIG_DELAY>` stores the authorized mint signer. `balances: Owned<BalanceSet<Context>>` maps `AztecAddress -> wFJ balance` via `UintNote` private notes. `CONFIG_DELAY = 600` (~half an L2 epoch). | Implemented |
| **Method: `constructor(owner)`** | Public initializer. Schedules the owner via `DelayedPublicMutable`; the value becomes effective after `CONFIG_DELAY` elapses. | Implemented |
| **Method: `update_owner(owner)`** | Public. Only callable by the current owner (`get_current_value()`). Schedules a new owner via `DelayedPublicMutable`. | Implemented |
| **Method: `mint(account, amount, secret)`** | Private. Validates custom authwit (inner hash `H(amount, secret)`) signed by the owner's account contract via `_verify_authwit()`. The authwit is pushed as a nullifier for replay prevention. Credits `amount` to `account`'s balance. Does NOT self-sponsor — use `mint_and_pay_fee()` for cold-start. | Implemented |
| **Method: `mint_and_pay_fee(account, amount, secret)`** | Private, `#[allow_phase_change]`. Same authwit verification as `mint()`, but also deducts `max_gas_cost` from the minted amount and self-sponsors the transaction. Credits `(amount - max_gas_cost)` to `account`. Calls `set_as_fee_payer()` then `end_setup()`. Solves the cold-start problem. | Implemented |
| **Method: `pay_fee()`** | Private, `#[allow_phase_change]`. Deducts max gas cost from `msg_sender`'s wFJ balance using recursive `try_sub` with `INITIAL_TRANSFER_CALL_MAX_NOTES = 2` (falls back to `RECURSIVE_TRANSFER_CALL_MAX_NOTES = 8`); handles change notes with `ONCHAIN_UNCONSTRAINED` delivery; calls `set_as_fee_payer()` then `end_setup()`. No refund of unused gas. | Implemented |
| **Method: `pay_fee_exact()`** | Private, `#[allow_phase_change]`. Same balance deduction as `pay_fee()`, plus creates `PartialUintNote` for refund; sets teardown to call `_refund()`; calls `set_as_fee_payer()` then `end_setup()`. Refunds `max_gas_cost - transaction_fee` in teardown. | Implemented |
| **Method: `_verify_authwit(amount, secret)`** | Internal private. Computes `inner_hash = H(amount, secret)`, reads `owner` from `DelayedPublicMutable`, delegates signature verification to the owner's account contract via `assert_inner_hash_valid_authwit()`. | Implemented |
| **Method: `_refund(max_gas_cost, partial_note)`** | Public, `#[only_self]`. Teardown function called by `pay_fee_exact()`. Calculates `refund_amount = max_gas_cost - transaction_fee` and completes the partial note if refund > 0. | Implemented |
| **Method: `balance_of(account)`** | Unconstrained utility view. Returns the wFJ balance of an account. | Implemented |
| **Library: `get_max_gas_cost(context)`** | `#[contract_library_method]`. Calculates max gas cost from transaction gas settings: `(DA limit + DA teardown) * max_fee_per_da_gas + (L2 limit + L2 teardown) * max_fee_per_l2_gas`. | Implemented |
### TypeScript SDK

| Requirement | Acceptance Criteria | Status |
| --- | --- | --- |
| **`MeteredFeePaymentMethod`** | Implements `FeePaymentMethod` interface. Calls `pay_fee()` on the FPC in setup phase. No refund of unused gas. | Implemented |
| **`MeteredExactFeePaymentMethod`** | Implements `FeePaymentMethod` interface. Calls `pay_fee_exact()` on the FPC in setup phase. Refunds unused gas via teardown. | Implemented |
| **`MeteredMintAndPayFeePaymentMethod`** | Implements `FeePaymentMethod`. Calls `mint_and_pay_fee(account, amount, secret)` with authwit witness. Self-sponsors the transaction. Solves cold-start. | Implemented |
| **`MeteredMintThenPayFeePaymentMethod`** | Implements `FeePaymentMethod`. Two-step flow: calls `mint(account, amount, secret)` then `pay_fee()` in the same transaction. Requires existing FJ to pay for the tx. | Implemented |
| **`deployMeteredContract(wallet, owner)`** | Utility to deploy a Metered FPC contract with the given owner. Returns `MeteredContract` instance. | Implemented |
| **`maxFeesPerGasFromBaseFees(baseFees, multiplier)`** | Calculates max fees per gas from current base fees with a safety multiplier (default 3x). Returns `GasFees`. | Implemented |
| **`maxGasCostFor(maxFeesPerGas, gasLimits, teardownGasLimits)`** | Calculates maximum possible gas cost in wei. Formula matches the Noir `get_max_gas_cost()` implementation. | Implemented |
| **`REASONABLE_GAS_LIMITS` / `REASONABLE_TEARDOWN_GAS_LIMITS`** | Default gas limit constants sourced from `@aztec/constants`. | Implemented |
| **Contract artifacts** | Generated `MeteredContract`, `MeteredContractArtifact`, and `CounterContract` TypeScript bindings from compiled Noir. Public API exports: `MeteredContract` and `MeteredContractArtifact`. `CounterContract`/`CounterContractArtifact` are test-only (not re-exported from main index). | Implemented |

### Off-chain Service (Trusted Flow)

| Requirement | Acceptance Criteria | Status |
| --- | --- | --- |
| **Payment verification** | Off-chain agent validates `TopUp(from, amount)` events from the configured TopUp contract; recovers sender from EIP-712 signature and matches against TopUp event's `from` field for authorization; sums amounts across all matching events in the transaction; checks transaction finality | Planned |
| **Authwit generation** | User signs EIP-712 message (txHash) to prove TopUp ownership; agent recovers sender, derives mint secret deterministically via ECDSA, returns `{ amount, secret, authwit }` to user; user calls any minting function (`mint` or `mint_and_pay_fee`) on Aztec themselves | Planned |
| **AZT-only acceptance** | Agent only processes `TopUp` events from the designated TopUp contract (which handles AZT transfers internally) | Planned |
| **Stateless API** | `POST /api/v1/authwit/request` endpoint; same txHash always returns same `{ amount, secret, authwit }`; no database required | Planned |
| **Agent configuration** | `FPC_ADDRESS`, `OWNER_ADDRESS`, `SP_SIGNING_KEY`, and `CHAIN_<id>_TOPUP_CONTRACT` configured via environment variables; FPC deployed separately | Planned |

### P1 — Nice to Have

- Script for FPC fill-up of fee juice that automatically refills the FPC when close to being depleted.
- TypeScript `getBalance()` convenience wrapper that calls `balance_of()` and returns the result.

---

## Technical Architecture

### Contract Storage

```noir
#[storage]
struct Storage<Context> {
    owner: DelayedPublicMutable<AztecAddress, CONFIG_DELAY, Context>,
    balances: Owned<BalanceSet<Context>, Context>,
}
```

- **`owner`**: The account contract address that authorizes mints via authwit. Stored as `DelayedPublicMutable` with `CONFIG_DELAY = 600` (~half an L2 epoch); scheduled changes take effect only after the delay elapses. Transferable via `update_owner()`.
- **`balances`**: Maps `AztecAddress` to private wFJ balance using `UintNote` notes

### Deployment Flow

1. SP deploys FPC contract via `deployMeteredContract(wallet, owner)` — the `owner` is the account contract that will authorize mints
2. After `CONFIG_DELAY` (600s) elapses, the owner becomes effective and `mint()` / `mint_and_pay_fee()` can be called
3. SP funds FPC with Fee Juice by bridging from L1 via `fundL2AddressWithFeeJuiceFromL1()`
4. Users approve the TopUp contract to spend AZT, call `topUp(from, amount)`, obtain authwits from SP's off-chain agent (via EIP-712 signed request), and call a minting function (`mint` or `mint_and_pay_fee`) to credit their balance

### Fee Payment Flow: `pay_fee()` (No Refund)

```mermaid
sequenceDiagram
    participant User
    participant Wallet
    participant FPC as Metered FPC
    participant App as Application Contract

    Note over User,App: Standard Sponsor Flow (User has wFJ)

    User->>Wallet: Initiate transaction
    Wallet->>FPC: pay_fee() [setup phase]
    activate FPC
    FPC->>FPC: Calculate max_gas_cost from gas_settings
    FPC->>FPC: _deduct_max_gas_cost(sender)
    Note right of FPC: Recursive try_sub (max_notes=2, then 8)
    FPC->>FPC: set_as_fee_payer()
    FPC->>FPC: end_setup()
    deactivate FPC

    Wallet->>App: User's application call [app phase]
    activate App
    App-->>User: Transaction result
    deactivate App

    Note over FPC: Protocol settles actual_fee from FPC's FJ balance
    Note over User: User's wFJ debited max_gas_cost (no refund)
```

### Fee Payment Flow: `pay_fee_exact()` (With Refund)

```mermaid
sequenceDiagram
    participant User
    participant Wallet
    participant FPC as Metered FPC
    participant App as Application Contract

    Note over User,App: Exact Sponsor Flow (User gets refund)

    User->>Wallet: Initiate transaction
    Wallet->>FPC: pay_fee_exact() [setup phase]
    activate FPC
    FPC->>FPC: Calculate max_gas_cost from gas_settings
    FPC->>FPC: _deduct_max_gas_cost(sender)
    Note right of FPC: Recursive try_sub (max_notes=2, then 8)
    FPC->>FPC: Create PartialUintNote for sender
    FPC->>FPC: Set teardown: _refund(max_gas_cost, partial_note)
    FPC->>FPC: set_as_fee_payer()
    FPC->>FPC: end_setup()
    deactivate FPC

    Wallet->>App: User's application call [app phase]
    activate App
    App-->>User: Transaction result
    deactivate App

    FPC->>FPC: _refund() [teardown phase]
    activate FPC
    FPC->>FPC: refund = max_gas_cost - transaction_fee
    FPC->>FPC: Complete partial note with refund amount
    deactivate FPC

    Note over User: User's wFJ debited only actual transaction_fee
```

### Gas Cost Calculation

Max gas cost = `(DA gas limit + DA teardown limit) * max_fee_per_da_gas + (L2 gas limit + L2 teardown limit) * max_fee_per_l2_gas`

This formula is implemented identically in both:
- **Noir**: `get_max_gas_cost()` contract library method
- **TypeScript**: `maxGasCostFor()` utility function

Use `maxFeesPerGasFromBaseFees(baseFees, 3n)` to calculate fees with a 3x safety multiplier over current base fees.

### SDK Usage

```typescript
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintAndPayFeePaymentMethod,
  MeteredMintThenPayFeePaymentMethod,
  deployMeteredContract,
  maxFeesPerGasFromBaseFees,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from '@defi-wonderland/aztec-fee-payment';

// Deploy FPC with owner address
const fpc = await deployMeteredContract(wallet, ownerAddress);

// Mint balance for user (requires authwit from the owner's account contract)
await fpc.methods.mint(userAddress, amount, secret)
  .with({ authWitnesses: [authWitness] })
  .send();

// Option 1: pay_fee (no refund) - simpler, cheaper
await someContract.methods.doSomething()
  .send({
    fee: {
      paymentMethod: new MeteredFeePaymentMethod(fpc.address),
      gasSettings: { gasLimits, teardownGasLimits: Gas.empty(), maxFeesPerGas },
    },
  });

// Option 2: pay_fee_exact (with refund) - user pays only actual fee
await someContract.methods.doSomething()
  .send({
    fee: {
      paymentMethod: new MeteredExactFeePaymentMethod(fpc.address),
      gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
    },
  });

// Option 3: mint_and_pay_fee (cold-start) - mint and sponsor in one tx
const paymentMethod = new MeteredMintAndPayFeePaymentMethod(
  fpc.address, userAddress, amount, secret, authWitness
);
await someContract.methods.doSomething()
  .send({ fee: { paymentMethod } });

// Query balance
const balance = await fpc.methods.balance_of(userAddress).simulate({ from: userAddress });
```

---

## Test Coverage Matrix

### Integration Tests (TypeScript/vitest)

| Test Case | Method | Expected Result | Status |
| --- | --- | --- | --- |
| `pay_fee SUCCESS: sponsors transaction when user has balance` | `pay_fee()` | Transaction succeeds; FPC FJ balance decreases by actual fee; user wFJ balance decreases by max gas cost | Implemented |
| `pay_fee_exact SUCCESS: sponsors transaction and refunds unused gas` | `pay_fee_exact()` | Transaction succeeds; FPC FJ balance decreases by exact transaction fee; user wFJ balance decreases by exact transaction fee (refund works) | Implemented |
| `pay_fee INVALID: fails when user has insufficient balance` | `pay_fee()` | Transaction rejected (not included in block) when user has no internal balance | Implemented |

### Balance Invariant Tests

| Invariant | Assertion |
| --- | --- |
| Post-mint balance | `user.wFJ_balance == old_balance + minted_amount` |
| Post-`pay_fee` balance | `user.wFJ_balance == old_balance - max_gas_cost` |
| Post-`pay_fee_exact` balance | `user.wFJ_balance == old_balance - actual_transaction_fee` |
| FPC FJ after `pay_fee` | `fpc.fj_balance < fpc.fj_balance_before` (decreased by actual fee) |
| FPC FJ after `pay_fee_exact` | `fpc.fj_balance == fpc.fj_balance_before - transaction_fee` (exact) |

### Test Infrastructure

- Tests require Aztec sandbox running locally (`aztec start --sandbox`)
- Test timeout: 300 seconds (`TEST_TIMEOUT` constant)
- Tests run sequentially (no parallelism) due to shared sandbox state
- `beforeEach` mints fresh balance (100 FJ) for the test account
- `Counter` contract is used as the application contract for testing fee sponsorship
- `fundL2AddressWithFeeJuiceFromL1()` bridges FJ from L1 to fund the FPC

---

## EVM-Side Payment Flow

The off-chain agent serves a stateless API that verifies TopUp events on EVM chains and returns authwits for users to mint wFJ on Aztec. Key characteristics:

- **TopUp contract**: Users approve the TopUp contract to spend AZT, then call `topUp(from, amount)`, which transfers AZT to the fee recipient and emits a `TopUp` event
- **EIP-712 sender verification**: User signs txHash to prove they control the `from` address in the TopUp event
- **Stateless & deterministic**: Same `txHash` + same `sender` always returns the same `{ amount, secret, authwit }` — no database required
- **Privacy-preserving**: Agent never learns the user's Aztec address; user calls a minting function (`mint` or `mint_and_pay_fee`) themselves

```
EVM-Side Payment Flow:

1. User swaps tokens -> AZT on DEX (e.g., Uniswap on Base)
2. User approves the TopUp contract to spend AZT
3. User calls topUp(from, amount) on the TopUp contract
4. TopUp contract transfers AZT from caller to fee recipient, emits TopUp(from, amount)
5. User signs EIP-712 message (txHash) to prove TopUp ownership
6. User calls POST /api/v1/authwit/request with { evmTxHash, evmChainId, signature }
7. Agent recovers sender from EIP-712 signature, validates tx finality, filters TopUp events by recovered sender
8. Agent sums amounts from all matching TopUp events
9. Agent derives secret = sign(sha256(txHash || from), spKey).r % Fr.MODULUS (from = TopUp event's `from` field)
10. Agent generates authwit and returns { amount, secret, authwit }
11. User stores authwit in PXE and calls a minting function (mint or mint_and_pay_fee) on Aztec
```

> For the detailed off-chain agent specification, see the separate **Off-Chain Agent Specification** document (`docs/Off-Chain Agent — Project Specification.md`).

---

## Phase 2 — Authorized Mint with Custom Authwit

### Overview

Phase 2 replaces the permissionless `mint(account, amount)` with authorized minting via custom authwit. Two mint variants exist: `mint(account, amount, secret)` for pre-funded users, and `mint_and_pay_fee(account, amount, secret)` for cold-start self-sponsoring. The owner is stored as `DelayedPublicMutable` and transferable via `update_owner()`.

### Changes from Phase 1

| Component | Phase 1 (Legacy) | Phase 2 (Current) | Status |
| --- | --- | --- | --- |
| **`mint()` signature** | `mint(account: AztecAddress, amount: u128)` | `mint(account: AztecAddress, amount: u128, secret: Field)` | Implemented |
| **Authorization** | Permissionless | Custom authwit (`H(amount, secret)`) signed by owner's account contract | Implemented |
| **Recipient** | Explicit `account` parameter | Explicit `account` parameter (SP never learns Aztec address since user calls mint themselves) | Implemented |
| **Replay prevention** | None (can mint multiple times) | The authwit itself is pushed as a nullifier | Implemented |
| **Self-sponsoring** | No | Via `mint_and_pay_fee()` — deducts gas from minted amount | Implemented |
| **Storage** | `balances` only | `balances` + `DelayedPublicMutable<AztecAddress, CONFIG_DELAY>` owner | Implemented |
| **Initialization** | None | `constructor(owner: AztecAddress)` — owner effective after `CONFIG_DELAY` | Implemented |
| **Owner transfer** | N/A | `update_owner(owner)` — only callable by current owner | Implemented |
| **EVM payment** | N/A | TopUp contract with `topUp(from, amount)`; emits `TopUp` event | Agent: Planned |
| **EIP-712 verification** | N/A | User signs txHash to prove ownership of TopUp event's `from` address | Agent: Planned |
| **Secret derivation** | N/A | `secret = sign(sha256(txHash \|\| from), spKey).r % Fr.MODULUS` (deterministic ECDSA via RFC 6979; `from` from TopUp event) | Agent: Planned |
| **Authwit generation** | N/A | Authwit via Schnorr on Grumpkin (usable with `mint` or `mint_and_pay_fee`) | Agent: Planned |
| **Stateless API** | N/A | `POST /api/v1/authwit/request` | Agent: Planned |

### The Cold-Start Problem

**Problem**: User wants to call `mint()` to get wFJ, but they have no FJ to pay for the `mint()` transaction itself. This is a chicken-and-egg problem.

**Solution**: The FPC **self-sponsors** the mint transaction via `mint_and_pay_fee()`:

1. FPC verifies the authwit and calculates `max_gas_cost`
2. FPC credits `(amount - max_gas_cost)` to the user's balance
3. FPC calls `set_as_fee_payer()` and `end_setup()` to sponsor the transaction

### Preventing Double-Spend

**Authwit as nullifier**: The authwit itself is pushed as a nullifier for replay prevention. If the same authwit is used twice, the nullifier already exists and the transaction fails.

### Griefing Attack Prevention

**The Problem**: If we push the nullifier AFTER calling `set_as_fee_payer()`, an attacker can grief the FPC:

1. Attacker gets valid authwit, submits tx (succeeds, nullifier added)
2. Attacker submits SAME tx again
3. Private execution runs -> FPC commits to pay via `set_as_fee_payer()`
4. Sequencer processes -> nullifier exists -> tx fails
5. **FPC loses gas, attacker pays nothing**

**The Solution**: Push the nullifier BEFORE committing to pay. This will revert in the case that it was already pushed.

```
Secure Execution Order:
1. validate authwit
2. validate amount
3. push_nullifier(authwit) <- FAILS if authwit already used
4. set_as_fee_payer() <- FPC commits ONLY after validation
5. end_setup()
```

### Mint Authorization API (L2->Aztec Trusted Flow)

This specifies how users obtain authwits from the Service Provider (SP) after paying on EVM.

#### EVM-Side Payment Flow

```
1. SWAP: User swaps tokens -> AZT on DEX
2. APPROVE: User approves TopUp contract to spend AZT
3. TOPUP: User calls topUp(from, amount) on TopUp contract
4. SIGN: User signs EIP-712 message (txHash) to prove TopUp ownership
5. REQUEST: User sends { evmTxHash, evmChainId, signature } to SP agent
6. VALIDATE: Agent recovers sender from EIP-712, fetches TopUp events, matches sender to `from`
7. AGGREGATE: Agent sums amounts from all matching TopUp events for the recovered sender
8. DERIVE: Agent derives secret = sign(sha256(txHash || from), spKey).r % Fr.MODULUS
9. RESPONSE: SP returns { amount, secret, authwit } deterministically
10. MINT: User calls a minting function (mint or mint_and_pay_fee) on Aztec with stored authwit
```

#### EIP-712 Typed Data Specification

User signs the txHash to prove they control the EVM address that initiated the TopUp.

```typescript
// EIP-712 Domain
const domain = {
  name: 'Aztec FPC Claim',
  version: '1',
  chainId: 8453,  // EVM chain where payment was made (Base, Ethereum, etc.)
};

// EIP-712 Types - JUST the txHash
const types = {
  ClaimRequest: [
    { name: 'txHash', type: 'bytes32' },  // TopUp transaction hash
  ],
};

// User signs ONLY the txHash
const message = {
  txHash: '0xabc123...def',  // The TopUp txHash
};
```

#### API Specification

```yaml
POST /api/v1/authwit/request
Content-Type: application/json

Request:
{
  "evmTxHash": "0xabcdef...",   # TopUp transaction hash (32 bytes hex)
  "evmChainId": 8453,          # Chain where payment was made
  "signature": "0x..."         # EIP-712 signature over txHash (65 bytes)
}

Response (Success - 200):
{
  "amount": "1000000000000000000",    # Total AZT amount (sum of matching TopUp events)
  "secret": "0x789abc...",            # sign(sha256(txHash || from), spKey).r % Fr.MODULUS (deterministic ECDSA)
  "authwit": {                        # Owner's authwit (usable with mint or mint_and_pay_fee)
    "innerHash": "0x...",             # H(amount, secret)
    "outerHash": "0x...",             # H(consumer, chainId, version, innerHash)
    "witness": ["0x...", "0x...", "0x..."]     # Schnorr signature fields (3 elements)
  }
}

# SP is STATELESS: same txHash + same sender always returns same response!

Response (Error - 400):
{
  "error": "INVALID_SIGNATURE" | "TX_NOT_FOUND" | "TX_REVERTED" | "TX_NOT_FINALIZED" |
           "WRONG_RECIPIENT" | "INVALID_AMOUNT" | "INVALID_CHAIN"
}
```

#### Backend Verification Logic (Stateless)

```
HANDLE_AUTHWIT_REQUEST(evmTxHash, evmChainId, signature):

    1. RECOVER SENDER FROM SIGNATURE
       - Recover EVM address from EIP-712 signature (INVALID_SIGNATURE if malformed)
       - Recovered address is used as `from` filter in subsequent validation

    2. FETCH & VALIDATE TRANSACTION
       - Transaction succeeded
       - Transaction is finalized (enough confirmations)

    3. PARSE & VALIDATE TOPUP EVENTS
       - Parse TopUp(from, amount) events from receipt
       - Filter by: contract address (configured TopUp contract)
       - Filter by: `from` field matches recovered EIP-712 signer
       - If no matching events, WRONG_RECIPIENT (signer has no TopUp events)
       - Sum `amount` across all matching events (a single tx may contain multiple TopUp calls for the same `from`)
       - Reject if total amount below minimum (INVALID_AMOUNT)

    4. DERIVE SECRET (DETERMINISTIC)
       - secret = sign(sha256(txHash || from), spKey).r % Fr.MODULUS (deterministic ECDSA via RFC 6979)
       - Input: 32-byte txHash concatenated with 20-byte `from` address (from TopUp event, verified against EIP-712 signer), SHA-256'd to produce 32-byte ECDSA signing input
       - Same txHash + same sender -> same secret, always

    5. GENERATE AUTHWIT
       - Custom authwit (usable with mint or mint_and_pay_fee)

    6. RETURN
       - { amount, secret, authwit }
       - Stateless: same request = same response
```

### Why Stateless? (Phase 2 Design Properties)

| Property | Explanation |
| --- | --- |
| **No database** | Same txHash + same sender -> same TopUp event -> same secret -> same authwit, every time |
| **Idempotent** | User can retry request infinitely, always gets same response |
| **Deterministic secret** | `secret = sign(sha256(txHash \|\| from), spKey).r % Fr.MODULUS` is reproducible (deterministic ECDSA via RFC 6979) |
| **Crash-resilient** | No state to lose, no recovery needed |

### Why This Design? (Phase 2 Benefits)

| Benefit | Explanation |
| --- | --- |
| **Privacy-preserving** | SP never learns user's Aztec address |
| **Stateless SP** | No database, horizontally scalable, crash-resilient |
| **Deterministic** | Same txHash + same sender always produces same response |
| **Custom authwit** | Inner hash uses only `(amount, secret)` — allows any address to claim |
| **Replay prevention** | Authwit is pushed as nullifier after use on Aztec |

### Security Considerations (Phase 2)

1. **SP signing key security**: SP signing key is used for deterministic secret generation (ECDSA) and Schnorr authwit signing. Compromise allows minting of wFJ.
2. **Recipient privacy**: `caller` is NOT in the authwit — the `account` parameter is chosen by the user. SP never learns Aztec address.
3. **Secret determinism**: `secret = sign(sha256(txHash || from), spKey).r % Fr.MODULUS` (deterministic ECDSA via RFC 6979, `r` component reduced mod BN254 Fr). The signing input is SHA-256 of the 32-byte txHash concatenated with the 20-byte `from` address (from the TopUp event). Same txHash = same TopUp event = same `from` = same secret = same authwit.
4. **Replay prevention**: The authwit itself is pushed as a nullifier after use. Same authwit cannot mint twice.
5. **Custom authwit**: Modified authwit inner_hash uses only `(amount, secret)` — no caller, fpcAddress, or selector. Allows any address to claim.
6. **No revocation**: Once authwit is generated, it's valid until secret is used. Stateless means no revocation possible.
7. **EIP-712 verification**: SP recovers the signer address from the EIP-712 signature and uses it as the `from` filter when querying TopUp events. Only TopUp events where the `from` field matches the recovered signer are counted, implicitly proving TopUp ownership.
8. **Stateless availability**: SP has no database. User can retry infinitely—deterministic response.
9. **Cross-chain replay prevention**: Different EVM chains produce different txHashes, so the derived secret is naturally unique per chain. EIP-712 domain also includes EVM `chainId` to bind signatures to a specific chain. Different chains have different TopUp contracts configured via `CHAIN_<id>_TOPUP_CONTRACT`. Additionally, the `from` address is included in the secret derivation input (`sha256(txHash || from)`), providing per-sender secret isolation.
10. **Multi-event aggregation & cross-sender isolation**: If a transaction contains multiple `TopUp` events, the agent sums amounts only from events whose `from` matches the recovered EIP-712 signer. Events with a different `from` are excluded, preventing a multi-sender transaction from crediting all amounts to a single signer.

### Complete End-to-End Flow (Phase 2)

```mermaid
sequenceDiagram
    participant User
    participant EVM as EVM Network
    participant TopUp as TopUp Contract
    participant API as SP API (Stateless)
    participant FPC as Metered FPC
    participant OAC as Owner Account Contract

    User->>EVM: Swap tokens -> AZT on DEX
    User->>EVM: Approve TopUp contract to spend AZT
    User->>TopUp: topUp(from, amount)
    TopUp->>TopUp: Transfer AZT from caller to fee recipient
    TopUp->>TopUp: Emit TopUp(from, amount)
    User->>User: Sign EIP-712 message (txHash)
    User->>API: POST /api/v1/authwit/request { evmTxHash, evmChainId, signature }

    API->>API: Recover sender from EIP-712 signature
    API->>API: Validate tx: finality, filter TopUp events by recovered sender
    API->>API: Derive: secret = sign(sha256(txHash || from), spKey).r % Fr.MODULUS
    API->>API: Generate: authwit (usable with mint or mint_and_pay_fee)
    API->>User: Return { amount, secret, authwit }

    User->>User: Store authwit witness in PXE

    alt Cold-start (no FJ balance)
        User->>FPC: mint_and_pay_fee(account, amount, secret)
        FPC->>OAC: Verify custom authwit
        FPC->>FPC: Push authwit as nullifier (replay prevention)
        FPC->>FPC: Credit (amount - max_gas_cost) to account
        FPC->>FPC: set_as_fee_payer() (self-sponsor)
        FPC->>FPC: end_setup()
    else Has FJ balance (pre-funded)
        User->>FPC: mint(account, amount, secret)
        FPC->>OAC: Verify custom authwit
        FPC->>FPC: Push authwit as nullifier (replay prevention)
        FPC->>FPC: Credit amount to account
    end
    FPC-->>User: wFJ balance credited
```

---

## EVM TopUp Contract Specification

The TopUp contract is a custom EVM contract that handles AZT token transfers and emits structured events for the off-chain agent to process.

### Interface

```solidity
interface ITopUp {
    function topUp(address from, uint256 amount) external;
    function feeRecipient() external view returns (address);
    function pendingFeeRecipient() external view returns (address);
    function setPendingFeeRecipient(address newFeeRecipient) external;
    function acceptFeeRecipient() external;
}

event TopUp(address indexed from, uint256 amount);
```

### Behavior

- **`topUp(from, amount)`**: Permissionless. Requires the caller to have approved the TopUp contract to spend at least `amount` AZT. Transfers `amount` AZT from caller to the current `feeRecipient`, emits `TopUp(from, amount)`. The `from` parameter identifies the logical payer (used in secret derivation and matched against EIP-712 signer for authorization).
- **`feeRecipient()`**: Returns the current fee recipient address (where AZT tokens are forwarded).
- **`pendingFeeRecipient()`**: Returns the address nominated to become the next fee recipient (zero address if no transfer is pending).
- **`setPendingFeeRecipient(newFeeRecipient)`**: Nominates a new fee recipient. Only callable by the current fee recipient. Does NOT transfer the role — the nominee must accept.
- **`acceptFeeRecipient()`**: Completes the fee recipient transfer. Only callable by the `pendingFeeRecipient`. Sets `feeRecipient` to the caller and clears `pendingFeeRecipient`.

> **Two-step transfer**: Fee recipient changes follow a nominate-then-accept pattern (similar to OpenZeppelin's `Ownable2Step`). This prevents accidental transfers to incorrect addresses, which would permanently lock the fee recipient role.

### Agent Integration

- Configured via `CHAIN_<id>_TOPUP_CONTRACT` environment variable (one TopUp contract per EVM chain)
- Agent parses `TopUp` events from transaction receipts, filtering by the configured contract address
- Authorization: agent recovers sender from EIP-712 signature and matches against TopUp event's `from` field
- If multiple `TopUp` events match the same `from` in a single transaction, their amounts are summed into a single total
- Secret derivation uses `from` from the TopUp event: `sign(sha256(txHash || from), spKey).r % Fr.MODULUS`

---

## Version History

| Version | Date | Changes |
| --- | --- | --- |
| 1.0 | February 2026 | Initial draft with Phase 2 authwit design |
| 2.0 | February 2026 | Updated to reflect Phase 1 implementation: permissionless `mint(account, amount)`, removed owner/initialization, documented `pay_fee_exact()` and `_refund()`, added SDK requirements, moved authwit system to Future Phase 2 section, updated test matrix to match actual tests, added AZT-only token acceptance |
| 3.0 | February 2026 | Updated to Phase 2 as current target: `mint(amount, secret)` with authwit, aligned PRD with Agent Spec implementation, updated EVM payment flow to stateless authwit API, added agent configuration requirements (`FPC_ADDRESS`, `OWNER_ADDRESS`), marked agent-side items as Implemented and contract-side items as Planned |
| 3.1 | February 2026 | Simplified secret generation: replaced `txHash % Fr.MODULUS` with deterministic ECDSA (RFC 6979) signing of txHash, extracting `r` component mod BN254 Fr. Removed domain separator and chainId from secret derivation. Updated API response shape to match implementation (`secret` field, structured `authwit` object with `innerHash`/`outerHash`/`witness`). Added `INVALID_AMOUNT` and `INVALID_CHAIN` error codes. |
| 3.2 | February 2026 | Simplified inner_hash: removed `fpcAddress` and `selector` from inner_hash computation. Inner hash is now `H(amount, secret)` instead of `H(fpcAddress, selector, amount, secret)`. Custom authwit no longer binds to a specific FPC address or function selector. |
| 3.3 | 2026-02-11 | EIP-712 sender verification now checks against the token sender (Transfer event `from` field) instead of the transaction origin (`receipt.from` / `tx.origin`). Updated Backend Verification Logic, security considerations, EVM payment flow, and Phase 2 table to reflect this change. |
| 3.4 | 2026-02-11 | Security hardening: validator now pins sender to first matching AZT transfer and sums only same-sender transfers, preventing cross-sender amount aggregation in multi-sender transactions. Updated payment verification acceptance criteria, Backend Verification Logic, EVM payment flow, sequence diagram, and security considerations. |
| 3.5 | 2026-02-11 | Corrected sender filtering description: sender is recovered from EIP-712 signature (via `recoverClaimRequestSigner`) and passed as `from` filter to the validator — not "pinned to first matching transfer". Removed references to `verifyClaimRequestSignature` (only `recoverClaimRequestSigner` exists). Updated Backend Verification Logic, EVM payment flow, sequence diagram, security considerations #7 and #10, and payment verification acceptance criteria. |
| 3.6 | 2026-02-12 | Secret derivation now includes sender address: `secret = sign(sha256(txHash \|\| sender), spKey).r % Fr.MODULUS`. The 32-byte txHash is concatenated with the 20-byte sender address (recovered from EIP-712 signature) and SHA-256'd to produce the ECDSA signing input. Provides per-sender secret isolation. Updated EVM payment flow, Backend Verification Logic, Phase 2 table, stateless design properties, security considerations #3 and #9, sequence diagram, API response comments, mint() requirement and transition note. |
| 4.0 | 2026-02-25 | Key changes: (1) `owner` is now `DelayedPublicMutable<AztecAddress, CONFIG_DELAY>` with `CONFIG_DELAY = 600`; constructor schedules owner, effective after delay. (2) Added `update_owner(owner)` for transferable ownership. (3) `mint(account, amount, secret)` takes explicit `account` parameter (not `msg_sender`); authwit verified via owner's account contract; nullifier pushed for replay prevention. (4) Added `mint_and_pay_fee(account, amount, secret)` for cold-start self-sponsoring (credits `amount - max_gas_cost`). (5) Removed legacy permissionless `mint(account, amount)`. (6) `pay_fee`/`pay_fee_exact` use `#[allow_phase_change]` (replaces `#[nophasecheck]`) and recursive `try_sub` with `INITIAL_TRANSFER_CALL_MAX_NOTES = 2`. (7) SDK adds `MeteredMintAndPayFeePaymentMethod` and `MeteredMintThenPayFeePaymentMethod`; `deployMeteredContract` now takes `owner` parameter. (8) Target Aztec version bumped to `4.0.0-devnet.1-patch.0`. |
| 4.1 | 2026-02-26 | Replaced raw ERC20 transfers with custom TopUp contract (`topUp(from, amount)` emitting `TopUp` event). EIP-712 signature retained for authorization (proves ownership of TopUp event's `from` address). Agent secret derivation unchanged (deterministic ECDSA), but `from` address now sourced from TopUp event instead of ERC20 Transfer event. Added EVM TopUp Contract Specification section with two-step fee recipient transfer (`setPendingFeeRecipient` + `acceptFeeRecipient`). Removed "Future: Phase 2+" section (promoted to current design). Agent configuration: `CHAIN_<id>_TOPUP_CONTRACT` replaces `CHAIN_<id>_FEE_COLLECTOR` and `CHAIN_<id>_AZT_TOKEN`. All agent statuses set to Planned. |
