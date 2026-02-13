// pay_fee_exact()
// Deducts max_gas_cost from sender's balance with exact refund via teardown.
// See src/ts/test/README.md for the full test tree and coverage matrix.

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
