// constructor(owner: AztecAddress)
// Schedules the owner via DelayedPublicMutable. The value becomes
// effective only after CONFIG_DELAY elapses and a block is mined.
// See src/TEST-PLAN.md for the full test tree and coverage matrix.

use crate::{Metered, test::utils};
use aztec::{oracle::random::random, test::helpers::test_environment::TestEnvironment};

/// Verifies that the constructor correctly schedules the owner by performing
/// a mint after the delay has elapsed (which internally calls _verify_authwit
/// against the stored owner). If the owner was not scheduled correctly, the
/// authwit would fail.
#[test]
unconstrained fn constructor_sets_owner() {
    // setup() calls deploy_contract() which settles owner automatically
    let (env, contract_address, owner, _) = utils::setup(true);

    utils::mint_balance(env, contract_address, owner, owner, utils::MINT_AMOUNT);
    let balance = utils::get_balance(env, contract_address, owner);
    assert(balance == utils::MINT_AMOUNT, "Owner should have minted balance");
}

/// Verifies that calling the constructor a second time reverts.
#[test(should_fail_with = "EMITNULLIFIER: Attempted to emit duplicate nullifier")]
unconstrained fn constructor_reverts_on_reinit() {
    let (env, contract_address, owner, _) = utils::setup(false);

    env.call_public(owner, Metered::at(contract_address).constructor(owner));
}

/// Before CONFIG_DELAY elapses the owner reads as zero, so authwit
/// verification should fail when attempting to mint.
#[test(should_fail_with = "Unknown contract 0x0000000000000000000000000000000000000000000000000000000000000000")]
unconstrained fn constructor_owner_not_effective_before_delay() {
    let mut env = TestEnvironment::new();
    let owner = env.create_contract_account();

    // Deploy WITHOUT settling -- owner is scheduled but not yet effective
    let contract_address = utils::deploy_contract_unsettled(&mut env, owner);

    let secret = random();
    utils::add_metered_authwit(env, contract_address, owner, utils::MINT_AMOUNT, secret);

    // This should fail because the owner hasn't settled yet
    env.call_private(owner, Metered::at(contract_address).mint(owner, utils::MINT_AMOUNT, secret));
}
