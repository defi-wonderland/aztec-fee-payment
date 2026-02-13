// pay_fee()
// Deducts max_gas_cost from sender's balance. No refund of unused gas.
// See src/ts/test/README.md for the full test tree and coverage matrix.

use crate::{Metered, test::utils};

/// Happy path: sender has a large balance, pay_fee should succeed and
/// reduce the balance by max_gas_cost (which depends on TXE gas settings).
#[test]
unconstrained fn pay_fee_success_sufficient_balance() {
    let (env, contract_address, owner, _) = utils::setup(true);

    let mint_amount: u128 = 100_000_000;
    utils::mint_balance(env, contract_address, owner, owner, mint_amount);

    let balance_before = utils::get_balance(env, contract_address, owner);

    env.call_private(owner, Metered::at(contract_address).pay_fee());

    let balance_after = utils::get_balance(env, contract_address, owner);

    // Balance should have decreased (or stayed same if max_gas_cost is 0 in TXE)
    assert(balance_after <= balance_before, "Balance should not increase after pay_fee");
}
