# @defi-wonderland/aztec-fee-payment

Fee Payment Contract (FPC) for Aztec. This package provides a fully private fee payment strategy for sponsoring transaction fees on behalf of users.

## Installation

```bash
yarn add @defi-wonderland/aztec-fee-payment
```

## Available Contracts

| Contract | Description | Auth model |
|----------|-------------|-----------|
| **BridgedFPC** | Fully private. Bridge FeeJuice from L1; the claim converts to internal wFJ for fee sponsorship. | Cryptographic bridge proof (no owner, no agent) |

## Quick Start

### BridgedFPC

Fully private; no owner and no off-chain agent. Users bridge FeeJuice from L1 to the FPC address, then prove the bridge claim on L2 to credit private wFJ balance.

```typescript
import {
  FPCFeePaymentMethod,
  BridgedMintAndPayFeePaymentMethod,
  registerBridgedContract,
} from '@defi-wonderland/aztec-fee-payment';

// Register the BridgedFPC with the PXE — no deployment transaction needed
const fpc = await registerBridgedContract(wallet, salt);

// L1: deposit FeeJuice to the portal with a claimer-bound secretHash
// secretHash = computeSecretHash(poseidon2([salt, claimerAddress], DOM_SEP))
// FeeJuicePortal.depositToAztecPublic(_to=fpc.address, _amount, secretHash)

// L2 two-step flow: claim then mint
await feeJuice.methods.claim(fpc.address, amount, secret, leafIndex).send();
await fpc.methods.mint(amount, salt, leafIndex).send();

// Use internal wFJ balance to sponsor transactions
await someContract.methods.doSomething()
  .send({
    from: userAddress,
    fee: { paymentMethod: new FPCFeePaymentMethod(fpc.address) },
  });

// Or cold-start: FeeJuice.claim + mint_and_pay_fee in one transaction (no prior mint needed)
await someContract.methods.doSomething()
  .send({
    from: userAddress,
    fee: {
      paymentMethod: new BridgedMintAndPayFeePaymentMethod(
        fpc.address, amount, secret, salt, leafIndex,
      ),
    },
  });
```

## Transaction Behavior

All FPCs handle transaction failures consistently:

| Scenario | Transaction Result | Fee Paid? |
|----------|-------------------|-----------|
| **Private revert** | `INVALID` (not included in block) | No |
| **Public revert** | `APP_LOGIC_REVERTED` | Yes (FPC pays) |
| **Success** | `SUCCESS` | Yes (FPC pays) |

If private logic fails, the transaction is never included — no fees are charged. If the transaction is included and public logic reverts, the fee payer still pays.

## Exports

### Main Entry Point (`@defi-wonderland/aztec-fee-payment`)

```typescript
// Contracts
BridgedFPCContract, BridgedFPCContractArtifact

// Fee Payment Methods
FPCFeePaymentMethod                // pay_fee (no refund)
BridgedMintAndPayFeePaymentMethod  // FeeJuice.claim + mint_and_pay_fee (BridgedFPC)

// Utilities
REASONABLE_GAS_LIMITS
maxFeesPerGasFromBaseFees, maxGasCostFor
registerBridgedContract
```

### Sub-path Exports

- `@defi-wonderland/aztec-fee-payment/artifacts/bridged` - BridgedFPC contract and artifact
- `@defi-wonderland/aztec-fee-payment/fee-payment-methods` - Fee payment methods only
- `@defi-wonderland/aztec-fee-payment/utils` - Utility functions only

## License

MIT
