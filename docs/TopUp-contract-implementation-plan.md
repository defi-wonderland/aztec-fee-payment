# TopUp Solidity Contract — Implementation Plan

## Context

The PRD (v4.1) specifies an EVM `TopUp` contract that replaces direct ERC20 transfers. Users call `topUp(from, amount)` which transfers AZT to the fee recipient and emits a `TopUp(from, amount)` event. The off-chain agent currently parses ERC20 `Transfer` events with `feeCollectorAddress` + `aztTokenAddress` config — this must migrate to `TopUp` event parsing with `CHAIN_<id>_TOPUP_CONTRACT` config.

---

## 1. Foundry Setup & Dependencies

- Install Foundry toolchain (`forge`, `cast`, `anvil`) as a dev prerequisite
- Add `foundry.toml` at repo root: `src = "src/sol"`, `test = "src/sol/test"`, `out = "out"`, Solidity `0.8.34`, optimizer enabled
- Add OpenZeppelin Contracts via `forge install OpenZeppelin/openzeppelin-contracts` (for `IERC20`, `SafeERC20`)
- Add `package.json` scripts: `compile:sol`, `test:sol`
- Add `out/` and `cache/` to `.gitignore`
- Update `CLAUDE.md` with Solidity commands and `src/sol/` structure

## 2. Contract Implementation

### Files

| File | Description |
|---|---|
| `src/sol/interfaces/ITopUp.sol` | Interface with `topUp`, `feeRecipient`, `pendingFeeRecipient`, `setPendingFeeRecipient`, `acceptFeeRecipient`, and `TopUp` event |
| `src/sol/TopUp.sol` | Implementation |

### Behavior (from PRD §EVM TopUp Contract Specification)

- **Constructor** `(address _aztToken, address _feeRecipient)` — immutable AZT token, initial fee recipient
- **`topUp(from, amount)`** — permissionless; `transferFrom(msg.sender, feeRecipient, amount)` via `SafeERC20`; emit `TopUp(from, amount)`; validate `amount > 0`
- **`feeRecipient()`** / **`pendingFeeRecipient()`** — view getters
- **`setPendingFeeRecipient(newFeeRecipient)`** — only current `feeRecipient`; stores nominee
- **`acceptFeeRecipient()`** — only `pendingFeeRecipient`; completes two-step transfer, clears pending
- **`aztToken()`** — view, returns immutable token address

## 3. Foundry Unit Tests

**File:** `src/sol/test/TopUp.t.sol`

| Test | Description |
|---|---|
| `test_topUp_transfersTokensAndEmitsEvent` | AZT transferred to fee recipient, `TopUp` event emitted correctly |
| `test_topUp_revertsOnZeroAmount` | Revert when `amount == 0` |
| `test_topUp_revertsWithoutApproval` | Revert when caller hasn't approved the contract |
| `test_topUp_revertsOnInsufficientBalance` | Revert when caller has insufficient AZT |
| `test_topUp_multipleCallsSameFrom` | Multiple calls emit multiple events with same `from` |
| `test_topUp_differentFromThanCaller` | `from` can differ from `msg.sender` |
| `test_setPendingFeeRecipient_onlyFeeRecipient` | Only current fee recipient can call; others revert |
| `test_setPendingFeeRecipient_setsCorrectly` | Nominee stored and readable via `pendingFeeRecipient()` |
| `test_acceptFeeRecipient_onlyPending` | Only `pendingFeeRecipient` can accept; others revert |
| `test_acceptFeeRecipient_transfersRole` | `feeRecipient` updated, `pendingFeeRecipient` cleared |
| `test_acceptFeeRecipient_topUpUsesNewRecipient` | After transfer, `topUp` sends tokens to new recipient |
| `test_constructor_setsInitialState` | Constructor sets `aztToken` and `feeRecipient` correctly |
| `test_constructor_revertsOnZeroAddresses` | Revert for zero-address token or fee recipient |

## 4. Agent Migration (TopUp Event Parsing)

The agent currently parses ERC20 `Transfer` events. Migrate to `TopUp(address indexed from, uint256 amount)` events from the configured TopUp contract.

| File | Change |
|---|---|
| `src/ts/agent/services/evm/parser.ts` | Replace `parseTransferEvents` + `findFeeCollectorTransfers` with `parseTopUpEvents(receipt, topUpContractAddress, from)` |
| `src/ts/agent/types/index.ts` | Replace `ChainConfig.feeCollectorAddress` + `aztTokenAddress` with `topUpContractAddress`; update `configSchema` |
| `src/ts/agent/config/schema.ts` | Replace `CHAIN_<id>_FEE_COLLECTOR` + `CHAIN_<id>_AZT_TOKEN` with `CHAIN_<id>_TOPUP_CONTRACT` |
| `src/ts/agent/services/evm/validator.ts` | Update to use new parser (TopUp events instead of Transfer events) |
| `src/ts/agent/.env.example` | Update example env vars |

## 5. Agent Test Updates

| File | Change |
|---|---|
| `src/ts/agent/test/evm-parser.test.ts` | Rewrite for `parseTopUpEvents` |
| `src/ts/agent/test/validator.test.ts` | Update mocks/expectations for TopUp event flow |
| `src/ts/agent/test/config.test.ts` | Test `TOPUP_CONTRACT` env var parsing |
| `src/ts/agent/test/helpers.ts` | Mock receipts with `TopUp` events instead of `Transfer` events |
| `src/ts/agent/test/integration.test.ts` | Update integration flow |

## 6. Deployment Scripts

| File | Description |
|---|---|
| `scripts/deploy-topup.ts` | CLI with `--network` flag; deploys TopUp with AZT address + initial fee recipient; stores address to `deployments/<network>/topup.json` |
| `config/evm-config.ts` | EVM deployment config: chain RPCs, AZT token addresses per chain, deployer key env var |

## 7. CI Updates

| File | Change |
|---|---|
| `.github/workflows/pr-checks.yml` | Add Foundry install + `forge test` step |
| `package.json` | Add `test:sol` and `compile:sol` scripts; include `yarn test:sol` in `test` |

## 8. Documentation

| File | Change |
|---|---|
| `docs/product-requirements.md` | Update TopUp contract status from Planned to Implemented |
| `CLAUDE.md` | Add Solidity section (Foundry commands, `src/sol/` structure, deployment) |
| `README.md` | Add TopUp contract section |

---

## Execution Order

1. **Foundry setup** (§1) — tooling prerequisite
2. **Contract + interface** (§2) — core deliverable
3. **Foundry tests** (§3) — validate contract in isolation
4. **Agent migration** (§4) — update parser/config/validator
5. **Agent test updates** (§5) — validate agent changes
6. **Deployment scripts** (§6) — enable deploying to EVM chains
7. **CI updates** (§7) — `forge test` in CI
8. **Documentation** (§8) — sync docs

Tasks 2+3 can be done together. Tasks 4+5 can be done together. Task 8 happens automatically per the repo's post-change doc sync rule.
