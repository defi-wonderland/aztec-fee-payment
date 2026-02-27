// update_owner(owner: AztecAddress)
// Schedules an owner change after CONFIG_DELAY. Only callable by current owner.
// See src/TEST-PLAN.md for the full test tree and coverage matrix.

use crate::{Metered, test::utils};

/// Non-owner calling update_owner should revert.
#[test(should_fail_with = "caller is not owner")]
unconstrained fn update_owner_reverts_non_owner() {
    let (env, contract_address, _, user) = utils::setup(false);

    // user (not the owner) tries to update owner
    env.call_public(user, Metered::at(contract_address).update_owner(user));
}

/// Calling update_owner a second time before the delay overrides the first.
#[test]
unconstrained fn update_owner_second_call_overrides_first() {
    let (mut env, contract_address, owner, first_candidate) = utils::setup(false);
    let second_candidate = env.create_light_account();

    env.call_public(owner, Metered::at(contract_address).update_owner(first_candidate));
    env.call_public(owner, Metered::at(contract_address).update_owner(second_candidate));

    utils::settle_owner(env);

    // second_candidate is now the owner and can call update_owner
    env.call_public(
        second_candidate,
        Metered::at(contract_address).update_owner(second_candidate),
    );
}

/// After update_owner + settling, the new owner can call update_owner
#[test]
unconstrained fn update_owner_new_owner_effective_after_delay() {
    let (env, contract_address, owner, new_owner) = utils::setup(false);

    // Schedule new_owner as owner
    env.call_public(owner, Metered::at(contract_address).update_owner(new_owner));

    // Advance past CONFIG_DELAY so the new owner takes effect
    utils::settle_owner(env);

    // new_owner calls update_owner -- succeeds only if ownership transferred
    env.call_public(new_owner, Metered::at(contract_address).update_owner(new_owner));
}

/// After transfer, old owner can no longer call update_owner.
#[test(should_fail_with = "caller is not owner")]
unconstrained fn update_owner_old_owner_rejected_after_transfer() {
    let (env, contract_address, old_owner, new_owner) = utils::setup(false);

    // Transfer ownership
    env.call_public(old_owner, Metered::at(contract_address).update_owner(new_owner));
    utils::settle_owner(env);

    // Old owner tries to call update_owner -- should fail
    env.call_public(old_owner, Metered::at(contract_address).update_owner(old_owner));
}
