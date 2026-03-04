// mint(account: AztecAddress, amount: u128, secret: Field)
// Mints internal balance to an account. Requires authwit from owner.
// Authwit edge cases are tested here through mint() as the thinnest
// external wrapper (see README for details).
// See src/ts/test/README.md for the full test tree and coverage matrix.

use crate::{MeteredFPC, test::utils};
use aztec::oracle::random::random;

// ---- Happy path tests ----

#[test]
unconstrained fn mint_success() {
    let (env, contract_address, owner, _) = utils::setup(true);

    utils::mint_balance(env, contract_address, owner, owner, utils::MINT_AMOUNT);

    let balance = utils::get_balance(env, contract_address, owner);
    assert(balance == utils::MINT_AMOUNT, "Balance should equal minted amount");
}

#[test]
unconstrained fn mint_to_different_account() {
    let (env, contract_address, owner, user) = utils::setup(true);

    // Owner authorizes mint, but tokens go to user
    utils::mint_balance(env, contract_address, owner, user, utils::MINT_AMOUNT);

    let user_balance = utils::get_balance(env, contract_address, user);
    assert(user_balance == utils::MINT_AMOUNT, "User balance should equal minted amount");

    let owner_balance = utils::get_balance(env, contract_address, owner);
    assert(owner_balance == 0, "Owner balance should remain zero");
}

// ---- Authwit verification tests (via mint as thinnest wrapper) ----

/// No authwit registered -- oracle cannot find auth witness.
#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn mint_reverts_no_authwit() {
    let (env, contract_address, owner, _) = utils::setup(true);

    let secret = random();
    // Don't register authwit -- call mint directly
    env.call_private(owner, MeteredFPC::at(contract_address).mint(owner, utils::MINT_AMOUNT, secret));
}

/// Authwit registered for one secret, called with a different one.
#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn mint_reverts_wrong_secret() {
    let (env, contract_address, owner, _) = utils::setup(true);

    let registered_secret = random();
    let wrong_secret = random();
    let amount: u128 = 1000;

    // Register authwit with registered_secret
    utils::add_metered_authwit(env, contract_address, owner, amount, registered_secret);

    // Call mint with wrong_secret -- different inner hash, no matching authwit
    env.call_private(owner, MeteredFPC::at(contract_address).mint(owner, amount, wrong_secret));
}

/// Authwit registered for one amount, called with a different amount.
#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn mint_reverts_wrong_amount() {
    let (env, contract_address, owner, _) = utils::setup(true);

    let secret = random();
    let registered_amount: u128 = 1000;
    let wrong_amount: u128 = 2000;

    // Register authwit with registered_amount
    utils::add_metered_authwit(env, contract_address, owner, registered_amount, secret);

    // Call mint with wrong_amount -- different inner hash, no matching authwit
    env.call_private(owner, MeteredFPC::at(contract_address).mint(owner, wrong_amount, secret));
}

/// Authwit registered on a non-owner account -- should revert.
/// _verify_authwit delegates signature verification to the owner's account
/// contract, which rejects the message when the signer doesn't match.
#[test(should_fail_with = "Message not authorized by account 'valid_fn(self.context, message_hash)'")]
unconstrained fn mint_reverts_authwit_on_non_owner() {
    let (env, contract_address, _, user) = utils::setup(true);

    let secret = random();
    let amount: u128 = 1000;

    // Register the authwit on 'user' instead of 'owner'
    utils::add_metered_authwit(env, contract_address, user, amount, secret);

    env.call_private(user, MeteredFPC::at(contract_address).mint(user, amount, secret));
}

/// Authwit replay: same (amount, secret) used twice should be rejected
#[test(should_fail_with = "failed with duplicate nullifier")]
unconstrained fn mint_reverts_authwit_replay() {
    let (env, contract_address, owner, _) = utils::setup(true);

    let secret = random();
    let amount: u128 = 1000;

    // First mint: register authwit and spend it successfully
    utils::add_metered_authwit(env, contract_address, owner, amount, secret);
    env.call_private(owner, MeteredFPC::at(contract_address).mint(owner, amount, secret));

    // Second mint with the same parameters: the nullifier for this message hash
    // was already emitted, so this must fail regardless of having a valid witness
    env.call_private(owner, MeteredFPC::at(contract_address).mint(owner, amount, secret));
}
