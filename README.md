# Aztec Fee Payment Contracts

A collection of Fee Payment Contracts (FPCs) for Aztec that enable transaction fee sponsorship strategies.

## Overview

This repository provides a production-ready Metered FPC implementation:

| Contract | Description |
|----------|-------------|
| **Metered** | Tracks internal balances and deducts max gas cost |

## Project Structure

```
├── src/
│   ├── nr/                          # Noir smart contracts
│   │   ├── counter_contract/        # Test utility contract
│   │   └── metered_contract/        # Metered FPC
│   └── ts/                          # TypeScript package
│       ├── artifacts/               # Generated contract bindings
│       ├── fee-payment-methods/     # Fee payment method classes
│       ├── utils/                   # Utilities (gas, deploy)
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

The Metered FPC test file validates:
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
  MeteredContract,
  MeteredFeePaymentMethod,
  deployMeteredContract,
} from '@defi-wonderland/aztec-fee-payment';

// Deploy and fund the FPC
const fpc = await deployMeteredContract(wallet);

// Mint balance for user
await fpc.methods.mint(userAddress, 1_000_000_000_000n).send().wait();

// Use it for transactions
await myContract.methods.doSomething()
  .send({ fee: { paymentMethod: new MeteredFeePaymentMethod(fpc.address) } })
  .wait();
```

## Benchmarks

```bash
yarn benchmark
```

## License

MIT
