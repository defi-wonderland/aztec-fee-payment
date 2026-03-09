// mint_then_pay_fee is a two-step flow: mint() then pay_fee() in the same tx.
// See src/TEST-PLAN.md for the full test tree and coverage matrix.
//
// All tests in this file are disabled due to TXE limitations.
// See TEST-PLAN.md legend for BLOCKED definitions.
//
// use crate::{MeteredFPC, test::utils};
// use aztec::oracle::random::random;

// BLOCKED_1_2 -- pay_fee calls end_setup(); also needs non-zero gas
//
// #[test]
// unconstrained fn mint_then_pay_fee_success() {
//     let (env, contract_address, owner, user) = utils::setup(true);
//     let mint_amount: u128 = 100_000_000;
//     let secret = random();
//
//     // Step 1: owner authorizes and mints balance to user
//     utils::add_metered_authwit(env, contract_address, owner, mint_amount, secret);
//     env.call_private(
//         owner,
//         MeteredFPC::at(contract_address).mint(user, mint_amount, secret),
//     );
//
//     // Step 2: user pays fee from their minted balance
//     env.call_private(user, MeteredFPC::at(contract_address).pay_fee());
//
//     let balance = utils::get_balance(env, contract_address, user);
//     // balance should be mint_amount - max_gas_cost
//     assert(balance <= mint_amount, "Balance should decrease by max_gas_cost");
// }
