# Aztec Fee Payment Contracts

A collection of Fee Payment Contracts (FPCs) for Aztec that enable transaction fee sponsorship strategies.

## Overview

This repository provides two production-ready FPC implementations:

| Contract | Description | Auth model |
|----------|-------------|-----------|
| **MeteredFPC** | Tracks internal balances, deducts max gas cost. Optional exact refund via teardown. | Off-chain agent issues authwits for mints |
| **BridgedFPC** | Fully private. Users bridge FeeJuice from L1; the bridge claim converts to internal wFJ balance for fee sponsorship. | Cryptographic bridge proof (no owner, no agent) |

## Project Structure

```
├── src/
│   ├── nr/                          # Noir smart contracts
│   │   ├── counter_contract/        # Test utility contract
│   │   ├── metered_contract/        # MeteredFPC
│   │   └── bridged_contract/        # BridgedFPC
│   └── ts/                          # TypeScript package
│       ├── artifacts/               # Generated contract bindings
│       ├── fee-payment-methods/     # Fee payment method classes
│       ├── utils/                   # Utilities (gas, deploy)
│       └── test/                    # Integration tests
├── target/                          # Compiled contract artifacts
├── benchmarks/                      # Performance benchmarks
└── docs/                            # Product requirements
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
# Full rebuild: compile Noir + generate TS bindings
yarn ccc

# Or step by step
aztec compile
aztec codegen target --outdir src/artifacts
```

## Testing

Start the Aztec sandbox:

```bash
yarn start:sandbox
```

Run all tests:

```bash
yarn test        # Noir unit tests + JS integration tests
yarn test:nr     # Noir unit tests only
yarn test:js     # JS integration tests only
```

## External Usage

See [src/ts/README.md](src/ts/README.md) for detailed documentation on using the published NPM package.

```bash
yarn add @defi-wonderland/aztec-fee-payment
```

### MeteredFPC

Tracks internal balances per account. An off-chain agent authorizes mints via authwits. Supports an optional exact-refund teardown flow.

```typescript
import {
  MeteredFPCContract,
  MeteredFeePaymentMethod,
  deployMeteredFPCContract,
} from '@defi-wonderland/aztec-fee-payment';

// Deploy the FPC (owner is the account that authorizes mints)
const fpc = await deployMeteredFPCContract(wallet, ownerAddress);

// Owner mints internal balance for a user (requires off-chain authwit)
await fpc.methods.mint(userAddress, amount, secret).send();

// User sponsors a transaction from their internal balance
await myContract.methods.doSomething()
  .send({ fee: { paymentMethod: new MeteredFeePaymentMethod(fpc.address) } });
```

### BridgedFPC

Fully private; no owner and no off-chain agent. Users bridge FeeJuice from L1 to the FPC address, then call `mint_bridged` to convert the bridge claim into private wFJ balance.

```typescript
import {
  BridgedFPCContract,
  MeteredFeePaymentMethod,
  BridgedMintAndPayFeePaymentMethod,
  registerBridgedContract,
} from '@defi-wonderland/aztec-fee-payment';

// Register the BridgedFPC — no deployment transaction needed (fully private contract)
const fpc = await registerBridgedContract(wallet);

// --- L1: deposit to FeeJuicePortal with a claimer-bound secretHash ---
// secretHash = computeSecretHash(poseidon2([salt, claimerAddress], DOM_SEP))
// FeeJuicePortal.depositToAztecPublic(_to=fpc.address, _amount, secretHash)

// --- L2: two-step flow ---
// Step 1: claim FeeJuice on L2 (emits FeeJuice nullifier)
await feeJuice.methods.claim(fpc.address, amount, secret, leafIndex).send();

// Step 2: mint internal wFJ balance by proving the bridge claim
await fpc.methods.mint_bridged(amount, salt, leafIndex).send();

// User sponsors a transaction from their internal balance
await myContract.methods.doSomething()
  .send({ fee: { paymentMethod: new MeteredFeePaymentMethod(fpc.address) } });

// --- Cold-start: claim + mint + pay fee in one transaction ---
await myContract.methods.doSomething()
  .send({
    fee: {
      paymentMethod: new BridgedMintAndPayFeePaymentMethod(
        fpc.address, amount, secret, salt, leafIndex,
      ),
    },
  });
```

## Benchmarks

```bash
yarn benchmark
```

Benchmarks are defined in `Nargo.toml` under `[benchmark]` and run against a live local network. Each contract has its own benchmark file in `benchmarks/`.

## License

MIT
