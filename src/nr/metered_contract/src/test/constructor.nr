// constructor(owner: AztecAddress)
// Sets the owner in public immutable storage.
// See src/ts/test/README.md for the full test tree and coverage matrix.

use crate::{Metered, test::utils};

/// Verifies that the constructor correctly sets the owner by performing a mint
/// (which internally calls _verify_authwit against the stored owner). If the
/// owner was not set correctly, the authwit would fail.
#[test]
unconstrained fn constructor_sets_owner() {
    let (env, contract_address, owner, _) = utils::setup(true);

    // Mint uses _verify_authwit which reads the stored owner -- this proves
    // the constructor set it correctly.
    utils::mint_balance(env, contract_address, owner, owner, utils::MINT_AMOUNT);
    let balance = utils::get_balance(env, contract_address, owner);
    assert(balance == utils::MINT_AMOUNT, "Owner should have minted balance");
}

/// Verifies that calling the constructor a second time reverts.
#[test(should_fail)]
unconstrained fn constructor_reverts_on_reinit() {
    let (env, contract_address, owner, _) = utils::setup(false);

    // Attempt to call constructor again -- should revert (already initialized)
    env.call_public(owner, Metered::at(contract_address).constructor(owner));
}
