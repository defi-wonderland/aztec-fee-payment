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
  replay                                  x                  x

pay_fee
  success (deducts maxGasCost)            BLOCKED₁           x
  no refund (overpays vs tx fee)          BLOCKED₁₂          x
  insufficient balance (0 < bal < cost)   BLOCKED₁₂          x
  FPC has no FeeJuice                     BLOCKED₁₂          x

pay_fee_exact
  success + refund > 0                    BLOCKED₁           x
  success + refund == 0                   BLOCKED₁           SKIPPED
  insufficient balance (0 < bal < cost)   BLOCKED₁₂          x
  FPC has no FeeJuice                     BLOCKED₁₂          x

mint_and_pay_fee
  success (amount > cost)                 BLOCKED₁           x
  amount == cost (credits 0)              BLOCKED₁₂          x
  amount < cost (underflow)               BLOCKED₁₂          x
  invalid authwit                         x

mint_then_pay_fee
  success (two-step)                                         x

_refund
  only_self guard                         x

x        = tested
SKIPPED  = requires maxGasCost == transactionFee exactly, but receipts
           don't expose enough info to reverse-engineer the exact gas
           limits, and estimation is too imprecise to hit them
BLOCKED₁ = TXE's `call_private` bypasses the account-contract entrypoint,
           so functions calling `end_setup()` break its simplified kernel
           simulation (phase-counter / nonce-generator assertions)
BLOCKED₂ = TXE gas settings default to 0 (`GasSettings.empty()`), so
           `max_gas_cost` is always 0 and gas-dependent scenarios are
           infeasible in unit tests
```

## Fee Payment Strategies (TS)

```
FPCFeePaymentMethod                --> pay_fee()
FPCExactFeePaymentMethod           --> pay_fee_exact()
MeteredMintAndPayFeePaymentMethod  --> mint_and_pay_fee(account, amount, secret)
MeteredMintThenPayFeePaymentMethod --> mint(account, amount, secret) + pay_fee()
```

---

# Bridged FPC -- Test Coverage

## Contract Functions & Failure Modes

```
mint(amount, salt, leaf_index)
├── valid bridge claim (FeeJuice.claim nullifier exists)
│   ├── credits claimer by amount
│   └── wrong claimer (mismatched nullifier)          ⇒ REVERT
├── double-spend: same leaf_index used twice           ⇒ REVERT  duplicate nullifier
└── FeeJuice.claim was never called                   ⇒ REVERT  nullifier not in tree

pay_fee()
├── sender balance >= max_gas_cost
│   ├── deducts max_gas_cost from sender (no refund)
│   └── sets contract as fee payer
└── sender balance < max_gas_cost                     ⇒ REVERT

mint_and_pay_fee(amount, salt, leaf_index)
├── valid bridge claim, amount > max_gas_cost
│   └── credits claimer with (amount - max_gas_cost)
├── amount < max_gas_cost                             ⇒ REVERT  "Amount too low to cover gas cost"
└── invalid bridge claim                              ⇒ REVERT

balance_of(account)
├── returns balance for known account
└── returns 0 for unknown account
```

## Library Helpers

```
derive_bridge_secret(salt, claimer)
├── deterministic: same inputs → same secret
├── differs by salt
└── differs by claimer

get_bridge_gas_msg_hash(fpc_address, amount)
├── deterministic: same inputs → same hash
├── differs by amount
└── differs by fpc_address

compute_feejuice_claim_nullifier(fpc_address, amount, salt, claimer, leaf_index, chain_id, version)
├── deterministic: same inputs → same nullifier
├── differs by claimer
├── differs by salt
├── differs by amount
└── differs by leaf_index
```

## What's Tested Where

```
                                    Unit (Noir/TXE)    Integration (TS)
                                    ───────────────    ────────────────
derive_bridge_secret
  deterministic                         x
  differs by salt                       x
  differs by claimer                    x

get_bridge_gas_msg_hash
  deterministic                         x
  differs by amount                     x
  differs by fpc_address                x

compute_feejuice_claim_nullifier
  deterministic                         x
  differs by claimer                    x
  differs by salt                       x
  differs by amount                     x
  differs by leaf_index                 x

mint
  success (credits claimer)             BLOCKED_A          x
  wrong claimer (nullifier mismatch)    BLOCKED_A          x
  double-spend (replay)                 BLOCKED_A          x

pay_fee
  success (deducts maxGasCost)          BLOCKED_BC         x

mint_and_pay_fee
  success (credits amount - cost)       BLOCKED_ABC        x
  amount < cost (explicit assert)       BLOCKED_ABC        x

x        = tested
BLOCKED_A = TXE cannot inject a FeeJuice-siloed nullifier into the nullifier tree;
            assert_nullifier_exists always fails without a prior FeeJuice.claim
BLOCKED_B = TXE gas settings default to 0 (GasSettings.empty()), so max_gas_cost
            is always 0 and gas-dependent assertions are infeasible
BLOCKED_C = end_setup() breaks TXE kernel simulation (phase-counter assertion)
```

## Fee Payment Strategies (TS)

```
FPCFeePaymentMethod               --> pay_fee()
BridgedMintAndPayFeePaymentMethod --> FeeJuice.claim + mint_and_pay_fee(amount, salt, leaf_index)
```
