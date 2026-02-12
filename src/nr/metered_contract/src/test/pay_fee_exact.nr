// =============================================================================
// pay_fee_exact
// fn pay_fee_exact()
//
// Deducts max_gas_cost from sender's balance with exact refund via teardown.
//
// |-- given the sender has sufficient balance (balance > max_gas_cost)
// |   |-- when transaction_fee < max_gas_cost (refund occurs)
// |   |   |-- it should deduct max_gas_cost from the sender's balance
// |   |   |-- it should refund (max_gas_cost - transaction_fee) via teardown
// |   |   |-- it should create a partial note for the refund
// |   |   |-- it should set teardown to call _refund
// |   +-- when transaction_fee == max_gas_cost (no refund)
// |       |-- it should deduct max_gas_cost from the sender's balance
// |       |-- it should complete the partial note with zero amount
// |-- given the sender has zero balance
// |   +-- it reverts (no notes to subtract from)
//
// Note: pay_fee_exact creates partial notes and schedules teardown via
// set_as_teardown(). The TXE currently does not support this protocol
// mechanic and fails with a nonce-generator assertion. The success test
// is commented out until TXE support is added. The revert test works
// because it fails before reaching the teardown setup.
//
// https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.6-patch.1/yarn-project/pxe/src/contract_function_simulator/contract_function_simulator.ts#L402
// =============================================================================

use crate::{Metered, test::utils};

/// Sender has zero balance and no notes -- should fail.
#[test(should_fail)]
unconstrained fn pay_fee_exact_reverts_zero_balance() {
    let (env, contract_address, _, user) = utils::setup(true);

    // user has no balance
    env.call_private(user, Metered::at(contract_address).pay_fee_exact());
}

// NOTE: The following test is disabled due to a TXE limitation.
// pay_fee_exact calls set_as_teardown() which triggers an internal TXE
// assertion: "The first non revertible nullifier should be equal to the
// nonce generator." This is a known TXE bug, not a contract bug.
// The success path is verified via the TypeScript integration tests.
//
// #[test]
// unconstrained fn pay_fee_exact_success_sufficient_balance() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     let mint_amount: u128 = 100_000_000;
//     utils::mint_balance(env, contract_address, owner, owner, mint_amount);
//     env.call_private(owner, Metered::at(contract_address).pay_fee_exact());
//     let balance_after = utils::get_balance(env, contract_address, owner);
//     assert(balance_after <= mint_amount, "Balance should not exceed minted amount");
// }
