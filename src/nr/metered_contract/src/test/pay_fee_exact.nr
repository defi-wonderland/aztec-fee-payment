// pay_fee_exact()
// Deducts max_gas_cost from sender's balance with exact refund via teardown.
// See src/TEST-PLAN.md for the full test tree and coverage matrix.

use crate::{Metered, test::utils};

// BLOCKED_1_2 -- end_setup() breaks TXE + max_gas_cost is always 0
//
// #[test(should_fail)]
// unconstrained fn pay_fee_exact_reverts_insufficient_balance() {
//     let (env, contract_address, owner, user) = utils::setup(true);
//     // Give user a tiny balance — non-zero but insufficient for real gas costs
//     utils::mint_balance(env, contract_address, owner, user, 1);
//     env.call_private(user, Metered::at(contract_address).pay_fee_exact());
// }

// BLOCKED_1 -- end_setup() breaks TXE kernel simulation
//
// #[test]
// unconstrained fn pay_fee_exact_success_refund_gt_zero() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     utils::mint_balance(env, contract_address, owner, owner, 100_000_000);
//     env.call_private(owner, Metered::at(contract_address).pay_fee_exact());
//     let balance_after = utils::get_balance(env, contract_address, owner);
//     // When tx_fee < max_gas_cost, the teardown refunds the difference
//     // via a partial note. Balance should be mint_amount - tx_fee.
//     assert(balance_after <= 100_000_000, "Balance should not exceed minted amount");
// }

// BLOCKED_1 -- end_setup() breaks TXE kernel simulation
// Also needs max_gas_cost == tx_fee exactly (SKIPPED in integration tests).
//
// #[test]
// unconstrained fn pay_fee_exact_success_refund_eq_zero() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     utils::mint_balance(env, contract_address, owner, owner, 100_000_000);
//     env.call_private(owner, Metered::at(contract_address).pay_fee_exact());
//     let balance_after = utils::get_balance(env, contract_address, owner);
//     // When max_gas_cost == tx_fee, refund amount is 0 and the partial
//     // note is not completed. Balance decreases by exactly max_gas_cost.
//     assert(balance_after < 100_000_000, "Should deduct max_gas_cost");
// }

// BLOCKED_1_2 -- protocol-level FeeJuice check is not simulated by TXE
//
// #[test(should_fail)]
// unconstrained fn pay_fee_exact_fpc_has_no_fee_juice() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     utils::mint_balance(env, contract_address, owner, owner, 100_000_000);
//     // User has internal balance but the FPC contract itself lacks FeeJuice.
//     // The sequencer rejects the tx because the fee payer can't cover
//     // protocol fees. This is a protocol-level check not simulated by TXE.
//     env.call_private(owner, Metered::at(contract_address).pay_fee_exact());
// }
