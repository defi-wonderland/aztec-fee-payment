# @defi-wonderland/aztec-fee-payment

Fee Payment Contract (FPC) for Aztec — enables sponsored, metered, and token-based transaction fee payments.

## Overview

This package provides a complete solution for abstracting transaction fees on Aztec. Instead of users paying fees directly with FeeJuice, you can:

- **Sponsor transactions** — Your application pays all fees
- **Track internal balances** — Users prepay and you deduct from their balance
- **Accept tokens as payment** — Users pay with any ERC20-like token

## Installation

```bash
npm install @defi-wonderland/aztec-fee-payment
# or
yarn add @defi-wonderland/aztec-fee-payment
```

### Peer Dependencies

This package requires `@aztec/aztec.js` and `@aztec/stdlib`:

```bash
npm install @aztec/aztec.js @aztec/stdlib
```

## Package Structure

```
@defi-wonderland/aztec-fee-payment
├── /                      # Main entry - exports everything
├── /artifacts             # Contract artifact and TypeScript wrapper
├── /fee-payment-methods   # FeePaymentMethod implementations
└── /utils                 # Gas calculations, authwit helpers, deploy utilities
```

### Import Paths

```typescript
// Everything from main entry
import {
  FeePaymentContract,
  SponsoredFeePaymentMethod,
  maxGasCostFor,
} from '@defi-wonderland/aztec-fee-payment';

// Just the contract artifact
import {
  FeePaymentContract,
  FeePaymentContractArtifact,
} from '@defi-wonderland/aztec-fee-payment/artifacts';

// Just fee payment methods
import {
  SponsoredFeePaymentMethod,
  MeteredSponsoredFeePaymentMethod,
  MeteredTokenSponsoredFeePaymentMethod,
} from '@defi-wonderland/aztec-fee-payment/fee-payment-methods';

// Just utilities
import {
  REASONABLE_GAS_LIMITS,
  maxGasCostFor,
  createTokenSponsorshipAuthWitness,
} from '@defi-wonderland/aztec-fee-payment/utils';
```

---

## Quick Start

### 1. Deploy the Fee Payment Contract

```typescript
import { FeePaymentContract, deployFeePaymentContract } from '@defi-wonderland/aztec-fee-payment';

// Deploy a new FPC instance
const fpc = await deployFeePaymentContract(wallet);
console.log('FPC deployed at:', fpc.address.toString());

// Fund the FPC with FeeJuice (required to pay protocol fees)
// ... bridge FeeJuice from L1 or transfer from another account
```

### 2. Choose a Fee Payment Strategy

---

## Fee Payment Methods

### Sponsored (Unconditional)

The FPC pays all transaction fees — users pay nothing. Best for onboarding, airdrops, or subsidized transactions.

```typescript
import { SponsoredFeePaymentMethod } from '@defi-wonderland/aztec-fee-payment';

const paymentMethod = new SponsoredFeePaymentMethod(fpc.address);

await myContract.methods.doSomething()
  .send({
    from: userAddress,
    fee: { paymentMethod },
  })
  .wait();
```

### Sponsored with Class ID Validation

Only sponsor specific account contract types (e.g., only Schnorr accounts):

```typescript
import { ClassIdValidatedSponsoredFeePaymentMethod } from '@defi-wonderland/aztec-fee-payment';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';

const schnorrClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);

const paymentMethod = new ClassIdValidatedSponsoredFeePaymentMethod(
  fpc.address,
  schnorrClass.id,
);
```

### Metered (Internal Balance)

Track user balances internally. Users prepay FeeJuice-equivalent amounts, and you deduct from their balance per transaction.

```typescript
import { MeteredSponsoredFeePaymentMethod } from '@defi-wonderland/aztec-fee-payment';

// First, credit the user's internal balance
await fpc.methods.mint_fee_juice(userAddress, 1_000_000_000n).send().wait();

// Then use metered payment — deducts max gas cost from internal balance
const paymentMethod = new MeteredSponsoredFeePaymentMethod(fpc.address);

await myContract.methods.doSomething()
  .send({
    from: userAddress,
    fee: { paymentMethod },
  })
  .wait();
```

### Metered Exact (With Refund)

Same as metered, but refunds the difference between max gas cost and actual cost in the teardown phase:

```typescript
import { MeteredExactSponsoredFeePaymentMethod } from '@defi-wonderland/aztec-fee-payment';

const paymentMethod = new MeteredExactSponsoredFeePaymentMethod(fpc.address);
```

### Token-Based Payment

Users pay with any ERC20-like token. The FPC collects tokens and pays protocol fees in FeeJuice.

```typescript
import { Fr } from '@aztec/aztec.js/fields';
import {
  MeteredTokenSponsoredFeePaymentMethod,
  createTokenSponsorshipAuthWitness,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxGasCostFor,
  maxFeesPerGasFromBaseFees,
} from '@defi-wonderland/aztec-fee-payment';

// 1. Get current base fees and calculate max gas cost
const baseFees = await aztecNode.getCurrentBaseFees();
const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);
const maxGasCost = maxGasCostFor(maxFeesPerGas, REASONABLE_GAS_LIMITS, REASONABLE_TEARDOWN_GAS_LIMITS);

// 2. Create authorization witness for token transfer
const nonce = Fr.random();
const witness = await createTokenSponsorshipAuthWitness({
  kind: 'metered',           // or 'metered_exact'
  wallet,
  token: tokenContract,
  from: userAddress,
  feePayer: fpc.address,
  amount: maxGasCost,
  nonce,
});

// 3. Build payment method
const paymentMethod = new MeteredTokenSponsoredFeePaymentMethod(
  fpc.address,
  tokenContract.address,
  nonce,
);

// 4. Send transaction with authwit and gas settings
await myContract.methods.doSomething()
  .send({
    from: userAddress,
    authWitnesses: [witness],
    fee: {
      paymentMethod,
      gasSettings: {
        gasLimits: REASONABLE_GAS_LIMITS,
        teardownGasLimits: REASONABLE_TEARDOWN_GAS_LIMITS,
        maxFeesPerGas,
      },
    },
  })
  .wait();
```

### Simplified Token Payment Builder

Use the helper for a more streamlined approach:

```typescript
import {
  buildTokenSponsoredFeePaymentMethod,
  createTokenSponsorshipAuthWitness,
} from '@defi-wonderland/aztec-fee-payment';

const nonce = Fr.random();
const maxGasCost = /* calculate based on gas settings */;

// Build payment method
const paymentMethod = buildTokenSponsoredFeePaymentMethod({
  kind: 'metered',
  feePayer: fpc.address,
  tokenAddress: token.address,
  nonce,
});

// Create authwit
const witness = await createTokenSponsorshipAuthWitness({
  kind: 'metered',
  wallet,
  token,
  from: userAddress,
  feePayer: fpc.address,
  amount: maxGasCost,
  nonce,
});
```

---

## Available Fee Payment Methods

| Class | Description | Teardown |
|-------|-------------|----------|
| `SponsoredFeePaymentMethod` | Unconditionally sponsors all fees | None |
| `ClassIdValidatedSponsoredFeePaymentMethod` | Sponsors only specific account types | None |
| `MeteredSponsoredFeePaymentMethod` | Deducts max gas cost from internal balance | None |
| `MeteredExactSponsoredFeePaymentMethod` | Deducts max, refunds surplus | Refund |
| `MeteredTokenSponsoredFeePaymentMethod` | User pays max gas cost in tokens | None |
| `MeteredExactTokenSponsoredFeePaymentMethod` | User pays max, gets refund in tokens | Refund |

---

## Utilities Reference

### Gas Calculations

```typescript
import {
  REASONABLE_GAS_LIMITS,           // Default gas limits for app logic
  REASONABLE_TEARDOWN_GAS_LIMITS,  // Default gas limits for teardown
  maxFeesPerGasFromBaseFees,       // Convert base fees to max fees (with multiplier)
  maxGasCostFor,                   // Calculate total max gas cost
} from '@defi-wonderland/aztec-fee-payment/utils';

// Example: Calculate max gas cost for a transaction
const baseFees = await aztecNode.getCurrentBaseFees();
const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);
const maxGasCost = maxGasCostFor(
  maxFeesPerGas,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
);
```

### Token Sponsorship Helpers

```typescript
import {
  createTokenSponsorshipAuthWitness,  // Create authwit for token transfer
  buildTokenSponsoredFeePaymentMethod, // Build payment method from config
  buildTokenSponsorshipTransferAction, // Build the token transfer action (for custom authwit)
} from '@defi-wonderland/aztec-fee-payment/utils';
```

### Deployment

```typescript
import { deployFeePaymentContract } from '@defi-wonderland/aztec-fee-payment/utils';

const fpc = await deployFeePaymentContract(wallet);
```

---

## Contract Methods

The deployed `FeePaymentContract` exposes these methods:

| Method | Description |
|--------|-------------|
| `mint_fee_juice(to, amount)` | Credit internal FeeJuice balance |
| `burn_fee_juice(to, amount)` | Debit internal FeeJuice balance |
| `get_fee_juice_balance(account)` | Query internal balance |

---

## Architecture

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

## License

MIT — [Wonderland](https://defi.sucks)
