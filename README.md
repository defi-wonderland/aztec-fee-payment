# Aztec Fee Payment Contract (FPC)

<div align="center"><strong>Sponsor and abstract transaction fees on Aztec</strong></div>
<div align="center">A complete solution for gasless transactions, metered billing, and token-based fee payment</div>

<br />

## Overview

This repository contains the **Fee Payment Contract (FPC)** for Aztec, enabling applications to abstract transaction fees from users. Instead of users paying fees directly with FeeJuice, you can:

- **Sponsor transactions** — Your application pays all fees (gasless UX)
- **Track internal balances** — Users prepay and you deduct from their balance
- **Accept tokens as payment** — Users pay with any ERC20-like token

## Repository Structure

```
├── src/
│   ├── nr/                           # Noir contracts
│   │   ├── fee_payment_contract/     # The Fee Payment Contract
│   │   └── counter_contract/         # Simple test contract for integration tests
│   └── ts/                           # Publishable NPM package
│       ├── artifacts/                # Generated contract bindings
│       ├── fee-payment-methods/      # FeePaymentMethod implementations
│       ├── utils/                    # Gas calculations, authwit helpers
│       └── test/                     # Integration tests
├── benchmarks/                       # Performance benchmarking
└── target/                           # Compiled Noir artifacts
```

## Using the Package

### Installation

```bash
npm install @defi-wonderland/aztec-fee-payment
# or
yarn add @defi-wonderland/aztec-fee-payment
```

### Quick Example

```typescript
import {
  FeePaymentContract,
  SponsoredFeePaymentMethod,
  deployFeePaymentContract,
} from '@defi-wonderland/aztec-fee-payment';

// Deploy FPC and fund it with FeeJuice
const fpc = await deployFeePaymentContract(wallet);

// Sponsor a transaction (user pays nothing)
const paymentMethod = new SponsoredFeePaymentMethod(fpc.address);

await myContract.methods.doSomething()
  .send({
    from: userAddress,
    fee: { paymentMethod },
  })
  .wait();
```

📖 **See [`src/ts/README.md`](./src/ts/README.md) for complete documentation and all payment methods.**

---

## Development

### Prerequisites

1. Install Aztec CLI: [docs.aztec.network](https://docs.aztec.network/developers/getting_started)
2. Install dependencies: `yarn install`
3. Ensure Docker is running (required for Aztec sandbox)

### Build

```bash
yarn ccc  # Clean, Compile, Codegen
```

This runs:
- `yarn clean` — Remove build artifacts
- `yarn compile` — Compile Noir contracts
- `yarn codegen` — Generate TypeScript bindings

### Test

Tests automatically start and manage the Aztec sandbox:

```bash
yarn test        # All tests (Noir + TypeScript)
yarn test:js     # TypeScript integration tests only
yarn test:nr     # Noir unit tests only
```

Or with manual sandbox control:

```bash
aztec start --local-network  # In separate terminal
yarn test
```

### Benchmark

```bash
yarn benchmark
```

Metrics tracked: **Gates**, **DA Gas**, **L2 Gas**

---

## Fee Payment Methods

| Method | Description |
|--------|-------------|
| `SponsoredFeePaymentMethod` | Unconditionally sponsors all fees |
| `ClassIdValidatedSponsoredFeePaymentMethod` | Sponsors only specific account types |
| `MeteredSponsoredFeePaymentMethod` | Deducts max gas cost from internal balance |
| `MeteredExactSponsoredFeePaymentMethod` | Deducts max, refunds surplus in teardown |
| `MeteredTokenSponsoredFeePaymentMethod` | User pays with tokens via authwit |
| `MeteredExactTokenSponsoredFeePaymentMethod` | Token payment with surplus refund |

---

## Contract Architecture

The FPC works by prepending a sponsor function to user transactions:

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Transaction                         │
├─────────────────────────────────────────────────────────────────┤
│  1. User calls myContract.methods.doSomething()                 │
│  2. Transaction includes fee: { paymentMethod: ... }            │
│  3. FPC's sponsor function is prepended to the transaction      │
│  4. FPC calls context.set_as_fee_payer() to pay protocol fees   │
│  5. (Optional) Metered: deduct from user's internal balance     │
│  6. (Optional) Token: transfer tokens from user to FPC          │
│  7. User's app logic executes                                   │
│  8. (Optional) Teardown: refund surplus to user                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Resources

- [Aztec Documentation](https://docs.aztec.network/)
- [Noir Language Documentation](https://noir-lang.org/)
- [Fee Payment on Aztec](https://docs.aztec.network/aztec/concepts/fees)

## License

MIT — [Wonderland](https://defi.sucks)
