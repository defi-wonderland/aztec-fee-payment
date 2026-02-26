// balance_of(account: AztecAddress) -> u128
// Returns the internal balance of an account.
// See src/ts/test/README.md for the full test tree and coverage matrix.

use crate::{Metered, test::utils};

#[test]
unconstrained fn balance_of_minted_account() {
    let (env, contract_address, owner, _) = utils::setup(true);

    utils::mint_balance(env, contract_address, owner, owner, utils::MINT_AMOUNT);

    let balance = utils::get_balance(env, contract_address, owner);
    assert(balance == utils::MINT_AMOUNT, "Should return minted balance");
}

#[test]
unconstrained fn balance_of_unknown_account_returns_zero() {
    let (env, contract_address, _, user) = utils::setup(true);

    // user has never been minted to
    let balance = utils::get_balance(env, contract_address, user);
    assert(balance == 0, "Should return zero for unknown account");
}

#[test]
unconstrained fn balance_of_multiple_mints_returns_total() {
    let (env, contract_address, owner, _) = utils::setup(true);

    let first: u128 = 1000;
    let second: u128 = 2500;
    let third: u128 = 500;

    utils::mint_balance(env, contract_address, owner, owner, first);
    utils::mint_balance(env, contract_address, owner, owner, second);
    utils::mint_balance(env, contract_address, owner, owner, third);

    let balance = utils::get_balance(env, contract_address, owner);
    assert(balance == first + second + third, "Should return accumulated total");
}
