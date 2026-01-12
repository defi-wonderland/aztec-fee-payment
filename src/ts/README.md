# @defi-wonderland/aztec-fee-payment

Fee Payment Contracts (FPCs) for Aztec. This package provides 4 different fee payment strategies that can be used to sponsor transaction fees on behalf of users.

## Installation

```bash
yarn add @defi-wonderland/aztec-fee-payment
```

## Available Contracts

| Contract | Description | Use Case |
|----------|-------------|----------|
| **Unconditional** | Sponsors all transactions without conditions | Testing, free-tier services |
| **PerClassId** | Only sponsors transactions from a specific contract class | Whitelisted account types only |
| **Metered** | Tracks internal balances, deducts max gas cost | Pre-paid credits system |
| **MeteredToken** | Accepts ERC20-like tokens for payment (1:1 rate) | Pay-per-use with tokens |

## Quick Start

### Unconditional Fee Payment

The simplest FPC - it pays for all transactions unconditionally.

```typescript
import {
  UnconditionalContract,
  UnconditionalFeePaymentMethod,
  deployUnconditionalContract,
} from '@defi-wonderland/aztec-fee-payment';

// Deploy the FPC (must be funded with FeeJuice)
const fpc = await deployUnconditionalContract(wallet);

// Use it for any transaction
await someContract.methods.doSomething()
  .send({
    fee: { paymentMethod: new UnconditionalFeePaymentMethod(fpc.address) }
  })
  .wait();
```

### PerClassId Fee Payment

Only sponsors transactions from accounts of a specific contract class (e.g., only SchnorrAccountContract wallets).

```typescript
import {
  PerClassIdContract,
  PerClassIdFeePaymentMethod,
  deployPerClassIdContract,
} from '@defi-wonderland/aztec-fee-payment';
import { Fr } from '@aztec/aztec.js/fields';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';

// Get SchnorrAccountContract class ID from artifact
const contractClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);
const allowedClassId = new Fr(contractClass.id.toBigInt());

// Deploy FPC with the allowed class ID
const fpc = await deployPerClassIdContract(wallet, allowedClassId);

// Use it - will only work for accounts with matching class ID
await someContract.methods.doSomething()
  .send({
    fee: { paymentMethod: new PerClassIdFeePaymentMethod(fpc.address) }
  })
  .wait();
```

### Metered Fee Payment

Tracks internal balances per account. Users must have sufficient balance (via `mint()`) before using.

```typescript
import {
  MeteredContract,
  MeteredFeePaymentMethod,
  deployMeteredContract,
  maxGasCostFor,
  REASONABLE_GAS_LIMITS,
} from '@defi-wonderland/aztec-fee-payment';

// Deploy the FPC
const fpc = await deployMeteredContract(wallet);

// Mint internal balance for user
await fpc.methods.mint(userAddress, 1_000_000_000_000n).send().wait();

// User can now use the FPC
await someContract.methods.doSomething()
  .send({
    from: userAddress,
    fee: {
      paymentMethod: new MeteredFeePaymentMethod(fpc.address),
      gasSettings: { gasLimits: REASONABLE_GAS_LIMITS, ... }
    }
  })
  .wait();
```

### MeteredToken Fee Payment

Accepts tokens as payment. User must authorize the FPC to transfer tokens via authwit.

```typescript
import {
  MeteredTokenContract,
  MeteredTokenFeePaymentMethod,
  deployMeteredTokenContract,
  createMeteredTokenAuthWitness,
} from '@defi-wonderland/aztec-fee-payment';
import { Fr } from '@aztec/aztec.js/fields';

// Deploy FPC with accepted token
const fpc = await deployMeteredTokenContract(wallet, tokenAddress);

// Create authwit for token transfer
const nonce = Fr.random();
const authwit = await createMeteredTokenAuthWitness({
  wallet,
  token,
  from: userAddress,
  fpcAddress: fpc.address,
  amount: maxGasCost,
  nonce,
});

// Use it - pass authwit in send options
await someContract.methods.doSomething()
  .send({
    from: userAddress,
    authWitnesses: [authwit],
    fee: {
      paymentMethod: new MeteredTokenFeePaymentMethod(fpc.address, nonce),
      gasSettings: { ... }
    }
  })
  .wait();
```

## Transaction Behavior

All FPCs handle transaction failures consistently:

| Scenario | Transaction Result | Fee Paid? |
|----------|-------------------|-----------|
| **Private revert** | `INVALID` (not included in block) | No |
| **Public revert** | `APP_LOGIC_REVERTED` | Yes (FPC pays) |
| **Success** | `SUCCESS` | Yes (FPC pays) |

Key insight: If private logic fails, the transaction is never included - no fees are charged. But if the transaction is included and public logic reverts, the fee payer still pays the fees.

## Exports

### Main Entry Point (`@defi-wonderland/aztec-fee-payment`)

```typescript
// Contracts
UnconditionalContract, UnconditionalContractArtifact
PerClassIdContract, PerClassIdContractArtifact
MeteredContract, MeteredContractArtifact
MeteredTokenContract, MeteredTokenContractArtifact

// Fee Payment Methods
UnconditionalFeePaymentMethod
PerClassIdFeePaymentMethod
MeteredFeePaymentMethod
MeteredTokenFeePaymentMethod

// Utilities
REASONABLE_GAS_LIMITS, REASONABLE_TEARDOWN_GAS_LIMITS
maxFeesPerGasFromBaseFees, maxGasCostFor
createMeteredTokenAuthWitness
deployUnconditionalContract, deployPerClassIdContract
deployMeteredContract, deployMeteredTokenContract
```

### Sub-path Exports

- `@defi-wonderland/aztec-fee-payment/artifacts` - Contract artifacts only
- `@defi-wonderland/aztec-fee-payment/fee-payment-methods` - Fee payment methods only
- `@defi-wonderland/aztec-fee-payment/utils` - Utility functions only

## License

MIT
