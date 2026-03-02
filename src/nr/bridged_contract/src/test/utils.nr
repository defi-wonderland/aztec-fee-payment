// =============================================================================
// Bridged Contract -- Test Utilities
//
// Shared setup helpers and convenience functions used across all test files.
//
// Implementation notes:
//
//   - BridgedFPC has no owner and no constructor. It is a fully private
//     contract that does not need a public initializer. TXE deploys it
//     without any public call.
//
//   - mint() requires a FeeJuice nullifier to exist in the nullifier
//     tree, which cannot be injected via TXE oracles. Tests that exercise
//     the full mint flow are integration-only (TypeScript + sandbox).
//
//   - Protocol-level concerns (set_as_fee_payer, end_setup, nullifier tree
//     reads) are out of scope for unit tests. Verify only pure logic.
//
//   - Full integration flows (bridge from L1, FeeJuice.claim, gas funding)
//     belong in the TypeScript integration tests.
// =============================================================================

use crate::BridgedFPC;
use aztec::{
    oracle::random::random, protocol::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};

pub global MINT_AMOUNT: u128 = 1_000_000;

/// Deploys the BridgedFPC contract and creates two light accounts.
/// No owner or public initializer needed. The contract is fully private.
pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let user = env.create_light_account();
    let other = env.create_light_account();
    let contract_address = deploy_contract(&mut env);

    (env, contract_address, user, other)
}

/// Deploys the BridgedFPC contract without any public initializer.
pub unconstrained fn deploy_contract(env: &mut TestEnvironment) -> AztecAddress {
    env.deploy("BridgedFPC").without_initializer()
}

/// Returns the internal balance of an account via the utility function.
pub unconstrained fn get_balance(
    env: TestEnvironment,
    contract_address: AztecAddress,
    account: AztecAddress,
) -> u128 {
    env.simulate_utility(BridgedFPC::at(contract_address).balance_of(account))
}

/// Returns a random salt for use in bridge secret derivation.
pub unconstrained fn random_salt() -> Field {
    random()
}
