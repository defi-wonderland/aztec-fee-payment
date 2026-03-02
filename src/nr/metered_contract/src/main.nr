use aztec::macros::aztec;
pub mod test;

/// Metered Fee Payment Contract
/// Tracks internal balances and deducts max gas cost per transaction.
/// Users must have sufficient balance to cover estimated fees.
#[aztec]
pub contract MeteredFPC {
    use aztec::{
        authwit::auth::{assert_inner_hash_valid_authwit, compute_inner_authwit_hash},
        context::PrivateContext,
        macros::{
            functions::{allow_phase_change, external, initializer, internal, only_self},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{DelayedPublicMutable, Owned, StateVariable},
    };
    use balance_set::BalanceSet;
    use uint_note::{PartialUintNote, UintNote};

    // Delay used for owner changes
    // TODO: research & decide how much delay is needed
    global CONFIG_DELAY: u64 = 600; // Roughly half a L2 epoch
    // gas-optimized max notes for initial transfer call
    global INITIAL_TRANSFER_CALL_MAX_NOTES: u32 = 2;
    // max notes transfer for recursive transfer call if initial max notes are exceeded
    global RECURSIVE_TRANSFER_CALL_MAX_NOTES: u32 = 8;

    /// @param owner The address of the account contract that authorizes mints
    /// @param balances The private note-based balances mapping accounts to their internal FPC balance
    #[storage]
    struct Storage<Context> {
        owner: DelayedPublicMutable<AztecAddress, CONFIG_DELAY, Context>,
        balances: Owned<BalanceSet<Context>, Context>,
    }

    /// @notice Initializes the Metered FPC contract.
    /// @param owner The address of the account contract that authorizes mints
    #[external("public")]
    #[initializer]
    fn constructor(owner: AztecAddress) {
        self.storage.owner.schedule_value_change(owner);
    }

    /// @notice Schedules an owner change after the CONFIG_DELAY period.
    /// @param owner The new owner address
    #[external("public")]
    fn update_owner(owner: AztecAddress) {
        assert(self.msg_sender() == self.storage.owner.get_current_value(), "caller is not owner");

        self.storage.owner.schedule_value_change(owner);
    }

    /// @notice Sponsors the transaction by deducting max gas cost from sender's balance.
    /// @dev Does not refund unused gas - the full max_gas_cost is consumed.
    #[external("private")]
    #[allow_phase_change]
    fn pay_fee() {
        let sender = self.msg_sender();
        let _max_gas_cost = self.internal._deduct_max_gas_cost(sender);

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// @notice Sponsors the transaction with exact fee refunds.
    /// @dev Refunds `max_gas_cost - transaction_fee` via a partial note completed in teardown.
    #[external("private")]
    #[allow_phase_change]
    fn pay_fee_exact() {
        let sender = self.msg_sender();
        let max_gas_cost = self.internal._deduct_max_gas_cost(sender);

        // Prepare the partial note for the refund.
        let partial_note = UintNote::partial(
            sender,
            self.storage.balances.get_storage_slot(),
            self.context,
            sender,
            self.address,
        );

        // Set teardown to refund any surplus.
        self.set_as_teardown(MeteredFPC::at(self.address)._refund(max_gas_cost, partial_note));

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// @notice Mints tokens and pays fee in a single transaction.
    /// @param account The address to mint tokens to
    /// @param amount The amount to mint (must be >= max_gas_cost)
    /// @param secret A unique value (typically a signed tx hash) to enforce uniqueness
    #[external("private")]
    #[allow_phase_change]
    fn mint_and_pay_fee(account: AztecAddress, amount: u128, secret: Field) {
        self.internal._verify_authwit(amount, secret);

        // Calculate the max gas cost from transaction settings.
        let max_gas_cost = get_max_gas_cost(self.context);

        self.storage.balances.at(account).add(amount - max_gas_cost).deliver(
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// @notice Mints internal balance to an account.
    /// @param account The address to mint tokens to
    /// @param amount The amount to mint
    /// @param secret A unique value (typically a signed tx hash) to enforce uniqueness
    #[external("private")]
    fn mint(account: AztecAddress, amount: u128, secret: Field) {
        self.internal._verify_authwit(amount, secret);
        self.storage.balances.at(account).add(amount).deliver(MessageDelivery.ONCHAIN_UNCONSTRAINED);
    }

    /// @notice Teardown function that refunds unused gas to the sender.
    /// @param max_gas_cost The max gas cost deducted during setup
    /// @param partial_note The partial note to complete with the refund amount
    #[external("public")]
    #[only_self]
    fn _refund(max_gas_cost: u128, partial_note: PartialUintNote) {
        let transaction_fee = self.context.transaction_fee();
        let refund_amount = max_gas_cost - (transaction_fee as u128);
        if refund_amount > 0 {
            partial_note.complete(self.context, self.address, refund_amount);
        }
    }

    /// @notice Verifies authorization via the owner's account contract.
    /// @param amount The amount to authorize
    /// @param secret A unique value (typically a signed tx hash) to enforce uniqueness
    #[internal("private")]
    fn _verify_authwit(amount: u128, secret: Field) {
        let inner_hash = compute_inner_authwit_hash([amount as Field, secret]);

        // Delegate signature verification to the owner's account contract
        let owner = self.storage.owner.get_current_value();
        assert_inner_hash_valid_authwit(self.context, owner, inner_hash);
    }

    /// @notice Computes the max gas cost and deducts it from the account's balance.
    /// @param account The address to deduct the gas cost from
    /// @return The max gas cost that was deducted
    #[internal("private")]
    fn _deduct_max_gas_cost(account: AztecAddress) -> u128 {
        // Calculate the max gas cost from transaction settings.
        let max_gas_cost = get_max_gas_cost(self.context);

        // Deduct from account's balance (reverts if insufficient).
        // This happens in setup phase - if it fails, tx is invalid.
        let change =
            self.internal._subtract_balance(account, max_gas_cost, INITIAL_TRANSFER_CALL_MAX_NOTES);
        self.storage.balances.at(account).add(change).deliver(MessageDelivery.ONCHAIN_UNCONSTRAINED);

        max_gas_cost
    }

    /// @notice Subtracts balance from private balance.
    /// @dev Recurses via `recurse_subtract_balance_internal` if `max_notes` is insufficient.
    /// @param account The address of the account to subtract the balance from
    /// @param amount The amount of tokens to subtract
    /// @param max_notes The maximum number of notes to process in a single call
    /// @return The change to return to the owner
    #[internal("private")]
    fn _subtract_balance(account: AztecAddress, amount: u128, max_notes: u32) -> u128 {
        let subtracted = self.storage.balances.at(account).try_sub(amount, max_notes);
        if subtracted >= amount {
            // We have achieved our goal of nullifying notes that add up to more than amount, so we return the change.
            subtracted - amount
        } else {
            // Failing to subtract any amount means that the owner was unable to produce more notes that could be nullified.
            assert(subtracted > 0, "Balance too low");

            // try_sub failed to nullify enough notes to reach the target amount, so we compute the amount remaining
            // and try again.
            let remaining = amount - subtracted;

            self.call_self.recurse_subtract_balance_internal(account, remaining)
        }
    }

    /// @notice Recursively subtracts balance from private balance.
    /// @param account The address of the account to subtract the balance from
    /// @param amount The amount of tokens to subtract
    /// @return The change to return to the owner
    #[external("private")]
    #[only_self]
    fn recurse_subtract_balance_internal(account: AztecAddress, amount: u128) -> u128 {
        self.internal._subtract_balance(account, amount, RECURSIVE_TRANSFER_CALL_MAX_NOTES)
    }

    /// @notice Returns the private balance of an account
    /// @param account The address to query
    /// @return The private balance of the account
    #[external("utility")]
    unconstrained fn balance_of(account: AztecAddress) -> u128 {
        self.storage.balances.at(account).balance_of()
    }

    /// @notice Calculates the worst-case gas cost from transaction gas settings.
    /// @dev max_fee_per_da_gas * (da_gas_limit + da_teardown_gas_limit)
    ///    + max_fee_per_l2_gas * (l2_gas_limit + l2_teardown_gas_limit)
    ///
    /// `max_priority_fees_per_gas` is intentionally excluded: following EIP-1559
    /// semantics, `max_fees_per_gas` already bounds the per-gas cost.
    /// @param context The context of the private call
    /// @return The maximum gas cost for the transaction
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
