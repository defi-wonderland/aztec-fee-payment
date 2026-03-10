// mint_and_pay_fee(account: AztecAddress, amount: u128, secret: Field)
// Mints tokens and pays fee in a single tx. Authwit edge cases are
// tested exhaustively in mint.nr.
// See src/TEST-PLAN.md for the full test tree and coverage matrix.

use crate::{MeteredFPC, test::utils};
use aztec::oracle::random::random;

/// Smoke test: no authwit registered -> revert.
#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn mint_and_pay_fee_reverts_invalid_authwit() {
    let (env, contract_address, owner, _) = utils::setup(true);

    let amount: u128 = 100_000_000;
    let secret = random();

    // Don't register authwit
    env.call_private(owner, MeteredFPC::at(contract_address).mint_and_pay_fee(owner, amount, secret));
}

// BLOCKED_1 -- end_setup() breaks TXE kernel simulation
//
// #[test]
// unconstrained fn mint_and_pay_fee_success_amount_exceeds_gas_cost() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     let amount: u128 = 100_000_000;
//     let secret = random();
//     utils::add_metered_authwit(env, contract_address, owner, amount, secret);
//     env.call_private(
//         owner,
//         MeteredFPC::at(contract_address).mint_and_pay_fee(owner, amount, secret),
//     );
//     let balance = utils::get_balance(env, contract_address, owner);
//     // balance should be amount - max_gas_cost
//     assert(balance <= amount, "Balance should be at most the minted amount");
// }

// BLOCKED_1_2 -- also needs non-zero gas for max_gas_cost > 0
// When amount == max_gas_cost, the subtraction credits 0 to the account.
//
// #[test]
// unconstrained fn mint_and_pay_fee_amount_eq_cost() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     // amount must equal max_gas_cost from the tx gas settings
//     let amount: u128 = 100;
//     let secret = random();
//     utils::add_metered_authwit(env, contract_address, owner, amount, secret);
//     env.call_private(
//         owner,
//         MeteredFPC::at(contract_address).mint_and_pay_fee(owner, amount, secret),
//     );
//     let balance = utils::get_balance(env, contract_address, owner);
//     assert(balance == 0, "amount == cost should credit 0");
// }

// BLOCKED_1_2 -- also needs non-zero gas for max_gas_cost > 0
// When amount < max_gas_cost, the subtraction underflows and reverts.
//
// #[test(should_fail)]
// unconstrained fn mint_and_pay_fee_amount_lt_cost() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     // amount must be less than max_gas_cost from the tx gas settings
//     let amount: u128 = 1;
//     let secret = random();
//     utils::add_metered_authwit(env, contract_address, owner, amount, secret);
//     env.call_private(
//         owner,
//         MeteredFPC::at(contract_address).mint_and_pay_fee(owner, amount, secret),
//     );
// }

// BLOCKED_1_2 -- also needs non-zero gas for max_gas_cost > 0
// When amount < max_gas_cost, the explicit assert fires with a meaningful error.
//
// #[test(should_fail_with = "Amount too low to cover gas cost")]
// unconstrained fn mint_and_pay_fee_amount_lt_cost_assertion() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     let amount: u128 = 1;
//     let secret = random();
//     utils::add_metered_authwit(env, contract_address, owner, amount, secret);
//     env.call_private(
//         owner,
//         MeteredFPC::at(contract_address).mint_and_pay_fee(owner, amount, secret),
//     );
// }
