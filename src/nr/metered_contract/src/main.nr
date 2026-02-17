use aztec::macros::aztec;

/// Metered Fee Payment Contract
/// Tracks internal balances and deducts max gas cost per transaction.
/// Users must have sufficient balance to cover estimated fees.
#[aztec]
pub contract Metered {
    use aztec::{
        context::PrivateContext,
        macros::{functions::{allow_phase_change, external, only_self}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Owned, StateVariable},
    };
    use balance_set::BalanceSet;
    use uint_note::{PartialUintNote, UintNote};

    #[storage]
    struct Storage<Context> {
        balances: Owned<BalanceSet<Context>, Context>,
    }

    /// Sponsors the transaction by deducting max gas cost from sender's balance.
    /// If sender has insufficient balance, the transaction is invalid.
    /// NOTE: Does not refund unused gas - the full max_gas_cost is consumed.
    #[external("private")]
    #[allow_phase_change]
    fn pay_fee() {
        let sender = self.context.maybe_msg_sender().unwrap();

        // Calculate the max gas cost from transaction settings.
        let max_gas_cost = get_max_gas_cost(self.context);

        // Deduct from sender's balance (reverts if insufficient).
        // This happens in setup phase - if it fails, tx is invalid.
        let balance_set = self.storage.balances.at(sender);
        let subtracted = balance_set.try_sub(max_gas_cost, 1);

        // try_sub may have subtracted more or less than amount. We must ensure that we subtracted at least as much as
        // we needed, and then create a new note for the owner for the change (if any).
        assert(subtracted >= max_gas_cost, "Balance too low or note insufficient");
        balance_set.add(subtracted - max_gas_cost).deliver(MessageDelivery.ONCHAIN_UNCONSTRAINED);

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Sponsors the transaction with exact fee refunds.
    /// Deducts max gas cost upfront, then refunds the difference in teardown.
    #[external("private")]
    #[allow_phase_change]
    fn pay_fee_exact() {
        let sender = self.context.maybe_msg_sender().unwrap();

        // Calculate the max gas cost from transaction settings.
        let max_gas_cost = get_max_gas_cost(self.context);

        // Deduct from sender's balance using single note optimization (reverts if insufficient).
        // Use try_sub with max_notes = 1 to only read a single note, reducing proof generation time.
        let balance_set = self.storage.balances.at(sender);
        let subtracted = balance_set.try_sub(max_gas_cost, 1);

        // try_sub may have subtracted more or less than amount. We must ensure that we subtracted at least as much as
        // we needed, and then create a new note for the owner for the change (if any).
        assert(subtracted >= max_gas_cost, "Balance too low or note insufficient");
        balance_set.add(subtracted - max_gas_cost).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);

        // Prepare the partial note for the refund.
        let partial_note = UintNote::partial(
            sender,
            self.storage.balances.get_storage_slot(),
            self.context,
            sender,
            self.address,
        );

        // Set teardown to refund any surplus.
        self.set_as_teardown(Metered::at(self.address)._refund(max_gas_cost, partial_note));

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Mints internal balance to an account.
    /// NOTE: Currently permissionless for testing. Add access control in production.
    #[external("private")]
    fn mint(account: AztecAddress, amount: u128) {
        self.storage.balances.at(account).add(amount).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
    }

    /// Teardown function to refund unused gas.
    #[external("public")]
    #[only_self]
    fn _refund(max_gas_cost: u128, partial_note: PartialUintNote) {
        let transaction_fee = self.context.transaction_fee();
        let refund_amount = max_gas_cost - (transaction_fee as u128);
        partial_note.complete(self.context, self.address, refund_amount);
    }

    /// Returns the internal balance of an account.
    #[external("utility")]
    unconstrained fn balance_of(account: AztecAddress) -> u128 {
        self.storage.balances.at(account).balance_of()
    }

    /// Calculates the maximum gas cost from transaction gas settings.
    #[contract_library_method]
    pub fn get_max_gas_cost(context: &mut PrivateContext) -> u128 {
        let gas_settings = context.gas_settings();

        let l2_gas_limit = gas_settings.gas_limits.l2_gas;
        let da_gas_limit = gas_settings.gas_limits.da_gas;
        let l2_teardown_gas_limit = gas_settings.teardown_gas_limits.l2_gas;
        let da_teardown_gas_limit = gas_settings.teardown_gas_limits.da_gas;

        let max_fee_per_da_gas = gas_settings.max_fees_per_gas.fee_per_da_gas;
        let max_fee_per_l2_gas = gas_settings.max_fees_per_gas.fee_per_l2_gas;

        max_fee_per_da_gas * (da_gas_limit as u128 + da_teardown_gas_limit as u128)
            + max_fee_per_l2_gas * (l2_gas_limit as u128 + l2_teardown_gas_limit as u128)
    }
}
