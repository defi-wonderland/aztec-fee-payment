// pay_fee()
// Deducts max_gas_cost from sender's balance. No refund of unused gas.
// See src/TEST-PLAN.md for the full test tree and coverage matrix.
//
// All tests in this file are disabled due to TXE limitations.
// See TEST-PLAN.md legend for BLOCKED definitions.
//
// use crate::{Metered, test::utils};

// BLOCKED_1 -- end_setup() breaks TXE kernel simulation
//
// #[test]
// unconstrained fn pay_fee_success_sufficient_balance() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     utils::mint_balance(env, contract_address, owner, owner, 100_000_000);
//     let balance_before = utils::get_balance(env, contract_address, owner);
//     env.call_private(owner, Metered::at(contract_address).pay_fee());
//     let balance_after = utils::get_balance(env, contract_address, owner);
//     assert(balance_after < balance_before, "Balance should decrease after pay_fee");
// }

// BLOCKED_1_2 -- also needs non-zero gas for max_gas_cost > 0
// pay_fee deducts the full max_gas_cost with no refund mechanism.
// Even when tx_fee < max_gas_cost, the difference is lost.
//
// #[test]
// unconstrained fn pay_fee_no_refund() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     utils::mint_balance(env, contract_address, owner, owner, 100_000_000);
//     let balance_before = utils::get_balance(env, contract_address, owner);
//     env.call_private(owner, Metered::at(contract_address).pay_fee());
//     let balance_after = utils::get_balance(env, contract_address, owner);
//     // With non-zero gas, balance_before - balance_after should equal
//     // max_gas_cost (not the actual tx_fee), proving no refund occurs.
//     assert(balance_after < balance_before, "Should deduct max_gas_cost with no refund");
// }

// BLOCKED_1_2 -- needs non-zero gas (max_gas_cost = 0 means deduction always succeeds)
//
// #[test(should_fail_with = "Balance too low")]
// unconstrained fn pay_fee_insufficient_balance() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     // Don't mint -- owner has zero balance. With non-zero gas settings
//     // max_gas_cost > 0 and _deduct_max_gas_cost should revert.
//     env.call_private(owner, Metered::at(contract_address).pay_fee());
// }

// BLOCKED_1_2 -- protocol-level FeeJuice check is not simulated by TXE
//
// #[test(should_fail)]
// unconstrained fn pay_fee_fpc_has_no_fee_juice() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     utils::mint_balance(env, contract_address, owner, owner, 100_000_000);
//     // User has internal balance but the FPC contract itself lacks FeeJuice.
//     // The sequencer rejects the tx because the fee payer can't cover
//     // protocol fees. This is a protocol-level check not simulated by TXE.
//     env.call_private(owner, Metered::at(contract_address).pay_fee());
// }
