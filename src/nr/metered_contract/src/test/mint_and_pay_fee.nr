// mint_and_pay_fee(account: AztecAddress, amount: u128, secret: Field)
// Mints tokens and pays fee in a single tx. Authwit edge cases are
// tested exhaustively in mint.nr.
// See src/ts/test/README.md for the full test tree and coverage matrix.

use crate::{Metered, test::utils};
use aztec::oracle::random::random;

/// Smoke test: no authwit registered -> revert.
#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn mint_and_pay_fee_reverts_invalid_authwit() {
    let (env, contract_address, owner, _) = utils::setup(true);

    let amount: u128 = 100_000_000;
    let secret = random();

    // Don't register authwit
    env.call_private(owner, Metered::at(contract_address).mint_and_pay_fee(owner, amount, secret));
}

// NOTE: The following test is disabled due to a TXE limitation.
// mint_and_pay_fee combines _verify_authwit (emitting a nullifier) with
// set_as_fee_payer(), triggering an internal TXE nonce-generator assertion.
// The success path is verified via the TypeScript integration tests.
//
// #[test]
// unconstrained fn mint_and_pay_fee_success_amount_exceeds_gas_cost() {
//     let (env, contract_address, owner, _) = utils::setup(true);
//     let amount: u128 = 100_000_000;
//     let secret = random();
//     utils::add_metered_authwit(env, contract_address, owner, secret, amount);
//     env.call_private(
//         owner,
//         Metered::at(contract_address).mint_and_pay_fee(owner, amount, secret),
//     );
//     let balance = utils::get_balance(env, contract_address, owner);
//     assert(balance <= amount, "Balance should be at most the minted amount");
// }
