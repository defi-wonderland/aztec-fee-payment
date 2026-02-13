# Metered FPC -- Test Coverage

## Contract Functions & Failure Modes

```
constructor(owner)
├── sets owner in public immutable storage
└── reverts on re-initialization                          ⇒ REVERT

mint(account, amount, secret)
├── valid authwit from owner
│   ├── credits account by amount
│   ├── mint to self or to a different account
│   ├── accumulates across multiple mints
│   └── amount == 0 succeeds (no-op)
├── no authwit registered                                 ⇒ REVERT
├── wrong secret (different inner hash)                   ⇒ REVERT
├── wrong amount (different inner hash)                   ⇒ REVERT
├── authwit signed by non-owner                           ⇒ REVERT
└── replay: same (secret, amount) used twice              ⇒ REVERT  duplicate nullifier

pay_fee()
├── sender balance >= max_gas_cost
│   ├── deducts max_gas_cost from sender (no refund)
│   ├── user overpays by (max_gas_cost - tx_fee)
│   ├── returns change note for (subtracted - max_gas_cost)
│   └── sets contract as fee payer
├── sender balance < max_gas_cost                         ⇒ REVERT
└── FPC has no FeeJuice (can't pay sequencer)             ⇒ REVERT

pay_fee_exact()
├── sender balance >= max_gas_cost
│   ├── deducts max_gas_cost from sender
│   ├── creates partial note for refund
│   ├── teardown refunds (max_gas_cost - tx_fee) = 0
│   ├── teardown refunds (max_gas_cost - tx_fee) > 0
│   └── sets contract as fee payer
├── sender balance < max_gas_cost                         ⇒ REVERT
└── FPC has no FeeJuice                                   ⇒ REVERT

mint_and_pay_fee(account, amount, secret)
├── valid authwit, amount > max_gas_cost
│   └── credits account with (amount - max_gas_cost)
├── valid authwit, amount == max_gas_cost
│   └── credits account with 0
├── amount < max_gas_cost                                 ⇒ REVERT  u128 underflow
├── invalid authwit                                       ⇒ REVERT
└── replay                                                ⇒ REVERT  duplicate nullifier

_refund(max_gas_cost, partial_note)  [#only_self]
├── called by contract (via teardown)
│   └── completes partial note with (max_gas_cost - tx_fee)
└── called by external address                            ⇒ REVERT

balance_of(account)
├── returns balance for known account
├── accumulates across multiple mints
└── returns 0 for unknown account
```

## Unit Test Notes (Noir/TXE)

- `_verify_authwit` is `#[internal]` and cannot be called directly via the
  contract interface. Authwit edge cases are tested through `mint()` as the
  thinnest external wrapper.
- TXE gas settings default to 0, so `max_gas_cost` is 0 in unit tests. This
  makes insufficient-balance scenarios infeasible (marked `x*` below).
- `set_as_teardown()` and `set_as_fee_payer()` trigger an internal TXE
  nonce-generator assertion when combined with nullifier-emitting calls.
  Tests requiring these are marked `BLOCKED` and covered by integration tests.
  [Relevant TXE source.](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.6-patch.1/yarn-project/pxe/src/contract_function_simulator/contract_function_simulator.ts#L402)
- `_refund` requires a valid `PartialUintNote` (created by `UintNote::partial()`
  in `pay_fee_exact`). Creating one in isolation needs protocol support not
  available in TXE; the full refund flow is tested via integration tests.

## What's Tested Where

```
                                    Unit (Noir/TXE)    Integration (TS)
                                    ───────────────    ────────────────
constructor
  sets owner                              x
  reverts re-init                         x

balance_of
  returns balance                         x
  returns 0 unknown                       x
  accumulates                             x

mint
  success                                 x
  to different account                    x
  accumulates                             x
  zero amount                             x
  no authwit                              x
  wrong secret                            x
  wrong amount                            x
  non-owner signer                        x
  replay                                  x                  x

pay_fee
  success (deducts maxGasCost)            x*                 x
  no refund (overpays vs tx fee)                             x
  insufficient user balance                                  x
  FPC has no FeeJuice                                        x

pay_fee_exact
  success + refund > 0                    BLOCKED            x
  success + refund == 0                   BLOCKED            SKIPPED†
  zero user balance                       x                  x
  FPC has no FeeJuice                                        x

mint_and_pay_fee
  success (amount > cost)                 BLOCKED            x
  amount == cost (credits 0)                                 x
  amount < cost (underflow)               x**                x
  invalid authwit                         x

mint_then_pay_fee
  success (two-step)                                         x

_refund
  only_self guard                         x

x       = tested
x*      = tested but weak (TXE gas settings default to 0)
x**     = may hit TXE bug; added defensively
BLOCKED = disabled in Noir due to TXE nonce-generator bug
†SKIPPED = needs maxGasCost == txFee exactly; receipt lacks per-dimension
           gas breakdown and estimation under-counts setup-phase overhead
```

## Fee Payment Strategies (TS)

```
MeteredFeePaymentMethod           --> pay_fee()
MeteredExactFeePaymentMethod      --> pay_fee_exact()
MeteredMintAndPayFeePaymentMethod --> mint_and_pay_fee(account, amount, secret)
MeteredMintThenPayFeePaymentMethod --> mint(account, amount, secret) + pay_fee()
```
