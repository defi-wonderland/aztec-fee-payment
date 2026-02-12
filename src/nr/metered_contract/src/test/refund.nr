// =============================================================================
// _refund
// #[only_self]
// fn _refund(max_gas_cost: u128, partial_note: PartialUintNote)
//
// Teardown function to refund unused gas. Only callable by the contract
// itself (#[only_self]).
//
// |-- given the caller is NOT the contract itself
// |   +-- it reverts because of the only_self restriction
//
// Note: _refund requires a valid PartialUintNote (created by UintNote::
// partial() in pay_fee_exact). Creating one in isolation requires protocol
// support that may not be available in TXE. The only_self guard test can
// be verified independently. Full refund flow is best tested via the
// TypeScript integration tests (pay_fee_exact).
// =============================================================================

use crate::{Metered, test::utils};
use dep::uint_note::uint_note::PartialUintNote;

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
