# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Fee Payment Contracts (FPCs) for Aztec that enable transaction fee sponsorship. The main contract is **Metered**, which tracks internal balances and deducts max gas cost per transaction.

## Commands

```bash
# Development workflow
yarn ccc                    # Clean + Compile + Codegen (full rebuild)
yarn test                   # Run both Noir and TypeScript tests
yarn test:nr                # Noir unit tests only
yarn test:js                # TypeScript integration tests (vitest)
yarn benchmark              # Run performance benchmarks

# Individual build steps
yarn compile                # Compile Noir contracts with aztec
yarn codegen                # Generate TypeScript bindings from target/
yarn build                  # Full build (compile + codegen + TypeScript)

# Deployment
yarn deploy:devnet          # Deploy to devnet
yarn deploy:testnet         # Deploy to testnet
yarn deploy:local-network   # Deploy locally
yarn deploy:dry-run         # Simulate deployment
yarn fund-fpc:devnet        # Fund FPC with Fee Juice from L1

# Run specific Noir test
aztec test --package metered_contract <test_name>
```

## Architecture

### Noir Contracts (src/nr/)

**metered_contract/** - The main FPC implementation:
- `pay_fee()` - Deducts max gas cost, no refund (simpler, cheaper)
- `pay_fee_exact()` - Deducts max cost, refunds unused gas in teardown
- `mint(account, amount)` - Add internal balance (permissionless for testing)
- `balance_of(account)` - Query internal balance (unconstrained view)
- Uses `BalanceSet` for multi-note balance tracking

**counter_contract/** - Test utility contract for integration tests.

### TypeScript Package (src/ts/)

```
src/ts/
├── artifacts/              # Generated contract bindings (MeteredContract.ts)
├── fee-payment-methods/    # MeteredFeePaymentMethod, MeteredExactFeePaymentMethod
├── utils/                  # Gas calculations, deployment helpers
│   ├── gas.ts              # REASONABLE_GAS_LIMITS, maxGasCostFor()
│   └── deploy.ts           # deployMeteredContract()
└── test/
    ├── harness.ts          # createLocalNetworkContext(), fundL2AddressWithFeeJuiceFromL1()
    └── metered.test.ts     # Integration tests
```

### Fee Payment Flow

1. User calls contract method with `fee: { paymentMethod: new MeteredFeePaymentMethod(fpc.address) }`
2. FPC's `pay_fee()` runs in **setup phase**, deducting max gas cost from user's internal balance
3. If balance insufficient, transaction is `INVALID` (never included in block)
4. FPC calls `context.set_as_fee_payer()` to assume fee payment responsibility
5. For `pay_fee_exact()`, teardown refunds `max_gas_cost - transaction_fee` via partial note

### Gas Cost Calculation

Max gas cost = `(DA gas limit + DA teardown limit) * max_fee_per_da_gas + (L2 gas limit + L2 teardown limit) * max_fee_per_l2_gas`

Use `maxFeesPerGasFromBaseFees(baseFees, 3n)` to calculate fees with 3x safety multiplier.

## Testing Notes

- Tests require Aztec sandbox running locally (`aztec start --sandbox`)
- Test timeout: 200-300 seconds (Aztec operations are slow)
- Tests run sequentially (no parallelism) due to shared sandbox state
- `vitest.setup.ts` handles sandbox startup/teardown

## Version

Currently targeting Aztec v3.0.0-devnet.6-patch.1. Check `package.json` for exact version.
