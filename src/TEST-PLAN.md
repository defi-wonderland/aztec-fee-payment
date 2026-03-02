# Metered FPC -- Test Coverage

## Contract Functions & Failure Modes

```
constructor(owner)
├── schedules owner via DelayedPublicMutable (CONFIG_DELAY)
├── owner not effective before delay elapses              ⇒ REVERT
└── reverts on re-initialization                          ⇒ REVERT

update_owner(owner)
├── current owner can schedule a new owner
├── non-owner caller                                      ⇒ REVERT
├── second call before delay overrides first scheduled owner
├── after delay, new owner can authorize mints
└── after delay, old owner is rejected                    ⇒ REVERT

mint(account, amount, secret)
├── valid authwit from owner
│   ├── credits account by amount
│   └── mint to self or to a different account
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

- `owner` is `DelayedPublicMutable` (`CONFIG_DELAY = 600`): the scheduled
  value only becomes effective after the delay. `deploy_contract` advances
  time to settle the owner; `deploy_contract_unsettled` skips this.
- `_verify_authwit` is `#[internal]` and cannot be called directly via the
  contract interface. Authwit edge cases are tested through `mint()` as the
  thinnest external wrapper.
- TXE gas settings default to 0, so `max_gas_cost` is 0 in unit tests. This
  makes insufficient-balance scenarios infeasible (marked `BLOCKED` below).
- `set_as_teardown()` and `set_as_fee_payer()` trigger an internal TXE
  nonce-generator assertion when combined with nullifier-emitting calls.
  Tests requiring these are marked `BLOCKED` and covered by integration tests.
  [Relevant TXE source.](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.6-patch.1/yarn-project/pxe/src/contract_function_simulator/contract_function_simulator.ts#L402)

## What's Tested Where

```
                                    Unit (Noir/TXE)    Integration (TS)
                                    ───────────────    ────────────────
constructor
  schedules owner (DelayedPublicMutable)  x
  owner not effective before delay        x
  reverts re-init                         x

update_owner
  non-owner reverts                       x
  second call overrides first             x
  new owner effective after delay         x
  old owner rejected after transfer       x

balance_of
  returns balance                         x
  returns 0 unknown                       x
  accumulates                             x

mint
  success                                 x
  to different account                    x
  no authwit                              x
  wrong secret                            x
  wrong amount                            x
  non-owner signer                        x
  replay                                  x                  WIP

pay_fee
  success (deducts maxGasCost)            BLOCKED₁           WIP
  no refund (overpays vs tx fee)          BLOCKED₁₂          WIP
  insufficient user balance               BLOCKED₁₂          WIP
  FPC has no FeeJuice                     BLOCKED₁₂          WIP

pay_fee_exact
  success + refund > 0                    BLOCKED₁           WIP
  success + refund == 0                   BLOCKED₁           WIP
  zero user balance                       x                  WIP
  FPC has no FeeJuice                     BLOCKED₁₂          WIP

mint_and_pay_fee
  success (amount > cost)                 BLOCKED₁           WIP
  amount == cost (credits 0)              BLOCKED₁₂          WIP
  amount < cost (underflow)               BLOCKED₁₂          WIP
  invalid authwit                         x

mint_then_pay_fee
  success (two-step)                                         WIP

_refund
  only_self guard                         x

x        = tested
WIP      = integration test being implemented in a separate branch
BLOCKED₁ = TXE's `call_private` bypasses the account-contract entrypoint,
           so functions calling `end_setup()` break its simplified kernel
           simulation (phase-counter / nonce-generator assertions)
BLOCKED₂ = TXE gas settings default to 0 (`GasSettings.empty()`), so
           `max_gas_cost` is always 0 and gas-dependent scenarios are
           infeasible in unit tests
```

## Fee Payment Strategies (TS)

```
MeteredFeePaymentMethod           --> pay_fee()
MeteredExactFeePaymentMethod      --> pay_fee_exact()
MeteredMintAndPayFeePaymentMethod --> mint_and_pay_fee(account, amount, secret)
MeteredMintThenPayFeePaymentMethod --> mint(account, amount, secret) + pay_fee()
```
