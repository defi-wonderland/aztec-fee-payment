# TopUp Solidity Contract — Implementation Plan

## Context

The PRD (v4.1) specifies an EVM `TopUp` contract that replaces direct ERC20 transfers. Users call `topUp(from, amount)` which transfers AZT to the fee recipient and emits a `TopUp(from, amount)` event. The off-chain agent currently parses ERC20 `Transfer` events with `feeCollectorAddress` + `aztTokenAddress` config — this must migrate to `TopUp` event parsing with `CHAIN_<id>_TOPUP_CONTRACT` config.

---

## 1. Agent Migration (TopUp Event Parsing)

The agent currently parses ERC20 `Transfer` events. Migrate to `TopUp(address indexed from, uint256 amount)` events from the configured TopUp contract.

| File | Change |
|---|---|
| `src/ts/agent/services/evm/parser.ts` | Replace `parseTransferEvents` + `findFeeCollectorTransfers` with `parseTopUpEvents(receipt, topUpContractAddress, from)` |
| `src/ts/agent/types/index.ts` | Replace `ChainConfig.feeCollectorAddress` + `aztTokenAddress` with `topUpContractAddress`; update `configSchema` |
| `src/ts/agent/config/schema.ts` | Replace `CHAIN_<id>_FEE_COLLECTOR` + `CHAIN_<id>_AZT_TOKEN` with `CHAIN_<id>_TOPUP_CONTRACT` |
| `src/ts/agent/services/evm/validator.ts` | Update to use new parser (TopUp events instead of Transfer events) |
| `src/ts/agent/.env.example` | Update example env vars |

## 2. Agent Test Updates

| File | Change |
|---|---|
| `src/ts/agent/test/evm-parser.test.ts` | Rewrite for `parseTopUpEvents` |
| `src/ts/agent/test/validator.test.ts` | Update mocks/expectations for TopUp event flow |
| `src/ts/agent/test/config.test.ts` | Test `TOPUP_CONTRACT` env var parsing |
| `src/ts/agent/test/helpers.ts` | Mock receipts with `TopUp` events instead of `Transfer` events |
| `src/ts/agent/test/integration.test.ts` | Update integration flow |

## 3. Deployment Scripts

| File | Description |
|---|---|
| `scripts/deploy-topup.ts` | CLI with `--network` flag; deploys TopUp with AZT address + initial fee recipient; stores address to `deployments/<network>/topup.json` |
| `config/evm-config.ts` | EVM deployment config: chain RPCs, AZT token addresses per chain, deployer key env var |

## 4. Documentation

| File | Change |
|---|---|
| `docs/product-requirements.md` | Update TopUp contract status from Planned to Implemented |
| `CLAUDE.md` | Add Solidity section (Foundry commands, `src/sol/` structure, deployment) |
| `README.md` | Add TopUp contract section |

---

## Execution Order

1. **Agent migration** (§1) — update parser/config/validator
2. **Agent test updates** (§2) — validate agent changes
3. **Deployment scripts** (§3) — enable deploying to EVM chains
4. **Documentation** (§4) — sync docs

Tasks 1+2 can be done together. Task 4 happens automatically per the repo's post-change doc sync rule.
