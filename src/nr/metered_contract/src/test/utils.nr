// =============================================================================
// Metered Contract -- Test Utilities
//
// Shared setup helpers, deploy routines, and convenience functions
// used across all test files.
//
// Implementation notes:
//
//   - Authwit pattern: the Metered contract uses a custom inner-hash authwit
//     computed from [amount as Field, secret]. The add_metered_authwit helper
//     registers this with the owner's account contract via TXE oracles.
//
//   - The "consumer" in the authwit message hash is the Metered contract
//     address (since _verify_authwit makes a static call from the Metered
//     contract to the owner's account contract).
//
//   - Protocol-level concerns (set_as_fee_payer, end_setup, teardown
//     scheduling) are out of scope for unit tests -- their correctness
//     belongs to the protocol. Verify they are called, not that they work.
//
//   - Full integration flows (gas funding, block production,
//     cross-contract calls) belong in the TypeScript integration tests.
// =============================================================================

use crate::MeteredFPC;
use aztec::{
    authwit::auth::{compute_authwit_message_hash, compute_inner_authwit_hash},
    oracle::random::random,
    protocol::address::AztecAddress,
    test::helpers::{test_environment::TestEnvironment, txe_oracles},
};

pub global MINT_AMOUNT: u128 = 1_000_000;
// Mirrors Metered::CONFIG_DELAY (must be kept in sync)
global CONFIG_DELAY: u64 = 600;

/// Deploys the Metered contract and creates two accounts (owner + user).
/// Use `with_account_contracts = true` when authwit verification is needed.
pub unconstrained fn setup(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let (owner, user) = if with_account_contracts {
        let owner = env.create_contract_account();
        let user = env.create_contract_account();
        (owner, user)
    } else {
        let owner = env.create_light_account();
        let user = env.create_light_account();
        (owner, user)
    };

    let contract_address = deploy_contract(&mut env, owner);

    (env, contract_address, owner, user)
}

/// Deploys and initializes the Metered contract with the given owner,
/// then advances time past CONFIG_DELAY so the owner becomes effective.
pub unconstrained fn deploy_contract(
    env: &mut TestEnvironment,
    owner: AztecAddress,
) -> AztecAddress {
    let contract_address = deploy_contract_unsettled(env, owner);
    env.advance_next_block_timestamp_by(CONFIG_DELAY + 1);
    env.mine_block();
    contract_address
}

/// Deploys and initializes the Metered contract WITHOUT advancing time.
/// The scheduled owner value will NOT yet be readable in private.
/// Use this when testing pre-settlement behavior.
pub unconstrained fn deploy_contract_unsettled(
    env: &mut TestEnvironment,
    owner: AztecAddress,
) -> AztecAddress {
    let initializer = MeteredFPC::interface().constructor(owner);
    env.deploy("MeteredFPC").with_public_initializer(owner, initializer)
}

/// Advances the block timestamp past CONFIG_DELAY and mines a block,
/// causing any pending DelayedPublicMutable values to take effect.
pub unconstrained fn settle_owner(env: TestEnvironment) {
    env.advance_next_block_timestamp_by(CONFIG_DELAY + 1);
    env.mine_block();
}

/// Registers a custom inner-hash authwit for the Metered contract's _verify_authwit.
/// The inner hash is computed from [amount as Field, secret] and the consumer
/// (message_hash target) is the Metered contract address.
pub unconstrained fn add_metered_authwit(
    env: TestEnvironment,
    contract_address: AztecAddress,
    owner: AztecAddress,
    amount: u128,
    secret: Field,
) {
    let inner_hash = compute_inner_authwit_hash([amount as Field, secret]);
    let (chain_id, version) =
        env.utility_context(|context| (context.chain_id(), context.version()));
    let message_hash =
        compute_authwit_message_hash(contract_address, chain_id, version, inner_hash);
    txe_oracles::add_authwit(owner, message_hash);
}

/// Convenience helper: registers authwit and calls mint() to credit `account` with `amount`.
/// Uses a random secret to ensure unique nullifiers across calls.
pub unconstrained fn mint_balance(
    env: TestEnvironment,
    contract_address: AztecAddress,
    owner: AztecAddress,
    account: AztecAddress,
    amount: u128,
) {
    let secret = random();
    add_metered_authwit(env, contract_address, owner, amount, secret);
    env.call_private(owner, MeteredFPC::at(contract_address).mint(account, amount, secret));
}

/// Returns the internal balance of an account via the utility function.
pub unconstrained fn get_balance(
    env: TestEnvironment,
    contract_address: AztecAddress,
    account: AztecAddress,
) -> u128 {
    env.simulate_utility(MeteredFPC::at(contract_address).balance_of(account))
}
