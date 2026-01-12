# Aztec Fee Payment Contracts

A collection of Fee Payment Contracts (FPCs) for Aztec that enable various transaction fee sponsorship strategies.

## Overview

This repository provides 4 production-ready FPC implementations:

| Contract | Description |
|----------|-------------|
| **Unconditional** | Sponsors all transactions without any conditions |
| **PerClassId** | Only sponsors transactions from a specific contract class |
| **Metered** | Tracks internal balances and deducts max gas cost |
| **MeteredToken** | Accepts tokens for payment (1:1 conversion rate) |

## Project Structure

```
├── src/
│   ├── nr/                          # Noir smart contracts
│   │   ├── counter_contract/        # Test utility contract
│   │   ├── unconditional_contract/  # Unconditional FPC
│   │   ├── per_class_id_contract/   # Per-class-ID FPC
│   │   ├── metered_contract/        # Metered FPC
│   │   └── metered_token_contract/  # Token-based FPC
│   └── ts/                          # TypeScript package
│       ├── artifacts/               # Generated contract bindings
│       ├── fee-payment-methods/     # Fee payment method classes
│       ├── utils/                   # Utilities (gas, authwit, deploy)
│       └── test/                    # Integration tests
├── target/                          # Compiled contract artifacts
└── benchmarks/                      # Performance benchmarks
```

## Setup

### Prerequisites

- [Aztec Sandbox](https://docs.aztec.network/getting_started) v3.0.0 or later
- Node.js 22+
- Yarn 1.22+

### Installation

```bash
yarn install
```

### Compile Contracts

```bash
# Compile Noir contracts
nargo compile --silence-warnings

# Post-process with Aztec tooling
aztec compile

# Generate TypeScript bindings
aztec codegen target --outdir src/ts/artifacts
```

## Testing

Start the Aztec sandbox:

```bash
yarn start:sandbox
```

Run tests:

```bash
yarn test
```

Each FPC has its own test file that validates:
- ✅ **SUCCESS**: Transaction succeeds, FPC pays fees
- ❌ **Private revert**: Transaction is invalid (not included)
- ⚠️ **Public revert**: FPC still pays fees (APP_LOGIC_REVERTED)

## External Usage

See [src/ts/README.md](src/ts/README.md) for detailed documentation on using the published NPM package.

```bash
yarn add @defi-wonderland/aztec-fee-payment
```

Quick example:

```typescript
import {
  UnconditionalContract,
  UnconditionalFeePaymentMethod,
} from '@defi-wonderland/aztec-fee-payment';

// Deploy and fund the FPC
const fpc = await UnconditionalContract.deploy(wallet).send().deployed();

// Use it for transactions
await myContract.methods.doSomething()
  .send({ fee: { paymentMethod: new UnconditionalFeePaymentMethod(fpc.address) } })
  .wait();
```

## Benchmarks

```bash
yarn benchmark
```

## License

MIT
