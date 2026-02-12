# Metered FPC -- Test Coverage

## Contract Functions & Failure Modes

```
constructor(owner)
|-- sets owner in public immutable storage
+-- reverts on re-initialization

mint(account, amount, secret)
|-- valid authwit from owner
|   |-- credits account by amount
|   |-- mint to self or to a different account
|   +-- amount == 0 succeeds (no-op)
|-- no authwit registered                        --> revert
|-- wrong secret (different inner hash)           --> revert
|-- wrong amount (different inner hash)           --> revert
|-- authwit signed by non-owner                   --> revert
+-- replay: same (secret, amount) used twice      --> revert (duplicate nullifier)

pay_fee()
|-- sender balance >= max_gas_cost
|   |-- deducts max_gas_cost from sender (no refund)
|   |-- user overpays by (max_gas_cost - tx_fee)
|   |-- returns change note for (subtracted - max_gas_cost)
|   +-- sets contract as fee payer
|-- sender balance < max_gas_cost                 --> revert
+-- FPC has no FeeJuice (can't pay sequencer)     --> revert

pay_fee_exact()
|-- sender balance >= max_gas_cost
|   |-- deducts max_gas_cost from sender
|   |-- creates partial note for refund
|   |-- teardown refunds (max_gas_cost - tx_fee) = 0
|   |-- teardown refunds (max_gas_cost - tx_fee) > 0
|   +-- sets contract as fee payer
|-- sender balance < max_gas_cost                 --> revert
+-- FPC has no FeeJuice                           --> revert

mint_and_pay_fee(account, amount, secret)
|-- valid authwit, amount > max_gas_cost
|   +-- credits account with (amount - max_gas_cost)
|-- valid authwit, amount == max_gas_cost
|   +-- credits account with 0
|-- amount < max_gas_cost                         --> revert (u128 underflow)
|-- invalid authwit                               --> revert
+-- replay                                        --> revert (duplicate nullifier)

_refund(max_gas_cost, partial_note)  [#only_self]
|-- called by contract (via teardown)
|   +-- completes partial note with (max_gas_cost - tx_fee)
+-- called by external address                    --> revert

balance_of(account)
|-- returns accumulated balance
+-- returns 0 for unknown account
```

## Fee Payment Strategies (TS)

```
MeteredFeePaymentMethod           --> pay_fee()
MeteredExactFeePaymentMethod      --> pay_fee_exact()
MeteredMintAndPayFeePaymentMethod --> mint_and_pay_fee(account, amount, secret)
MeteredMintThenPayFeePaymentMethod --> mint(account, amount, secret) + pay_fee()
```

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
  success + refund == 0                   BLOCKED            x
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

x   = tested
x*  = tested but weak (TXE gas settings default to 0)
x** = may hit TXE bug; added defensively
BLOCKED = disabled in Noir due to TXE nonce-generator bug
```
