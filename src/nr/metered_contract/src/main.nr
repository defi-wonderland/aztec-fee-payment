use aztec::macros::aztec;

/// Metered Fee Payment Contract
/// Tracks internal balances and deducts max gas cost per transaction.
/// Users must have sufficient balance to cover estimated fees.
#[aztec]
pub contract Metered {
    use dep::aztec::{
        authwit::auth::{assert_inner_hash_valid_authwit, compute_inner_authwit_hash},
        context::PrivateContext,
        macros::{
            functions::{external, initializer, internal, allow_phase_change, only_self},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol::{address::AztecAddress, traits::{FromField, ToField}},
        state_vars::{DelayedPublicMutable, Owned, PublicImmutable, StateVariable},
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

    #[storage]
    struct Storage<Context> {
        owner: DelayedPublicMutable<AztecAddress, CONFIG_DELAY, Context>,
        balances: Owned<BalanceSet<Context>, Context>,
    }

    /// Initializes the Metered FPC contract.
    /// @param owner The address of the account contract that authorizes mints
    #[external("public")]
    #[initializer]
    fn constructor(owner: AztecAddress) {
        self.storage.owner.schedule_value_change(owner);
    }

    #[external("public")]
    fn update_owner(owner: AztecAddress) {
        assert(
            self.msg_sender() == self.storage.owner.get_current_value(),
            "caller is not owner",
        );

        self.storage.owner.schedule_value_change(owner);
    }

    /// Sponsors the transaction by deducting max gas cost from sender's balance.
    /// If sender has insufficient balance, the transaction is invalid.
    /// NOTE: Does not refund unused gas - the full max_gas_cost is consumed.
    #[external("private")]
    #[allow_phase_change]
    fn pay_fee() {
        let sender = self.msg_sender();
        self.internal._deduct_max_gas_cost(sender);

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
        self.set_as_teardown(Metered::at(self.address)._refund(max_gas_cost, partial_note));

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Mints tokens and pays fee in a single transaction.
    /// Verifies authorization via the owner's account contract, mints the specified amount,
    /// then deducts max gas cost. The minted amount must be >= max_gas_cost.
    /// @param account The address to mint tokens to
    /// @param amount The amount to mint
    /// @param secret A unique value (typically a signed tx hash) to enforce uniqueness
    #[external("private")]
    #[allow_phase_change]
    fn mint_and_pay_fee(account: AztecAddress, amount: u128, secret: Field) {
        self.internal._verify_authwit(secret, amount);

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

    /// Mints internal balance to an account.
    /// Requires authorization via the owner's account contract.
    /// @param account The address to mint tokens to
    /// @param amount The amount to mint
    /// @param secret A unique value (typically a signed tx hash) to enforce uniqueness
    #[external("private")]
    fn mint(account: AztecAddress, amount: u128, secret: Field) {
        self.internal._verify_authwit(secret, amount);
        self.storage.balances.at(account).add(amount).deliver(MessageDelivery.ONCHAIN_UNCONSTRAINED);
    }

    /// Teardown function to refund unused gas.
    #[external("public")]
    #[only_self]
    fn _refund(max_gas_cost: u128, partial_note: PartialUintNote) {
        let transaction_fee = self.context.transaction_fee();
        let refund_amount = max_gas_cost - (transaction_fee as u128);
        partial_note.complete(self.context, self.address, refund_amount);
    }

    /// @notice Verifies authorization via the owner's account contract.
    /// Computes an inner hash from secret and amount, then delegates verification
    /// to the owner's account contract via verify_private_authwit.
    /// @param secret A unique value (typically a signed tx hash) to enforce uniqueness
    /// @param amount The amount value
    #[internal("private")]
    fn _verify_authwit(secret: Field, amount: u128) {
        let inner_hash = compute_inner_authwit_hash([secret, amount as Field]);

        // Delegate signature verification to the owner's account contract
        let owner = self.storage.owner.get_current_value();
        assert_inner_hash_valid_authwit(self.context, owner, inner_hash);
    }

    /// @notice Computes the max gas cost and deducts it from the account's balance.
    /// @param account The address to deduct the gas cost from
    /// @return max_gas_cost
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

    /// @notice Subtracts balance from private balance
    /// @dev Subtracts amount from private balance and returns the change to the owner, recursively if necessary
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

    /// @notice Recursively subtracts balance from private balance
    /// @dev Used to subtract private balances that exceed the max notes limit
    /// @param account The address of the account to subtract the balance from
    /// @param amount The amount of tokens to subtract
    /// @return The change to return to the owner
    #[external("private")]
    #[only_self]
    fn recurse_subtract_balance_internal(account: AztecAddress, amount: u128) -> u128 {
        self.internal._subtract_balance(account, amount, RECURSIVE_TRANSFER_CALL_MAX_NOTES)
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
