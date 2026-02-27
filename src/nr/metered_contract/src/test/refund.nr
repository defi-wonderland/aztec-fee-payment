// _refund(max_gas_cost: u128, partial_note: PartialUintNote) [#only_self]
// Teardown function to refund unused gas. Only callable by the contract itself.
// See src/ts/test/README.md for the full test tree and coverage matrix.

use crate::{Metered, test::utils};
use uint_note::PartialUintNote;

/// External caller (not the contract itself) tries to call _refund -- should
/// revert because of the #[only_self] restriction.
#[test(should_fail)]
unconstrained fn refund_reverts_external_caller() {
    let (env, contract_address, owner, _) = utils::setup(true);

    // Create a dummy PartialUintNote (zeroed out) -- the call should fail
    // on the only_self check before reaching any note logic.
    let dummy_partial_note: PartialUintNote = std::mem::zeroed();

    // Call from owner (external address), NOT from the contract itself
    env.call_public(owner, Metered::at(contract_address)._refund(1000, dummy_partial_note));
}
