# @defi-wonderland/aztec-fee-payment

Fee Payment Contracts (FPCs) for Aztec. This package provides a Metered fee payment strategy that can be used to sponsor transaction fees on behalf of users.

## Installation

```bash
yarn add @defi-wonderland/aztec-fee-payment
```

## Available Contracts

| Contract | Description | Use Case |
|----------|-------------|----------|
| **Metered** | Tracks internal balances, deducts max gas cost | Pre-paid credits system |

## Quick Start

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
await fpc.methods.mint(userAddress, 1_000_000_000_000n).send();

// User can now use the FPC
await someContract.methods.doSomething()
  .send({
    from: userAddress,
    fee: {
      paymentMethod: new MeteredFeePaymentMethod(fpc.address),
      gasSettings: { gasLimits: REASONABLE_GAS_LIMITS, ... }
    }
  })
  ;
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
MeteredContract, MeteredContractArtifact

// Fee Payment Methods
MeteredFeePaymentMethod
MeteredExactFeePaymentMethod

// Utilities
REASONABLE_GAS_LIMITS, REASONABLE_TEARDOWN_GAS_LIMITS
maxFeesPerGasFromBaseFees, maxGasCostFor
deployMeteredContract
```

### Sub-path Exports

- `@defi-wonderland/aztec-fee-payment/artifacts` - Contract artifacts only
- `@defi-wonderland/aztec-fee-payment/fee-payment-methods` - Fee payment methods only
- `@defi-wonderland/aztec-fee-payment/utils` - Utility functions only

## License

MIT
