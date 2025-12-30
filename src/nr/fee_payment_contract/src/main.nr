use dep::aztec::macros::aztec;

/// Fee Payment Contract
/// This contract covers transaction fees for users.
#[aztec]
pub contract FeePayment {
    use dep::aztec::{
        macros::{functions::{external, nophasecheck, only_self}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{Owned, state_variable::StateVariable},
    };
    use dep::balance_set::BalanceSet;
    use dep::token::Token;
    use dep::uint_note::uint_note::{PartialUintNote, UintNote};

    #[storage]
    struct Storage<Context> {
        fee_juice_balance: Owned<BalanceSet<Context>, Context>,
    }

    /// Sponsors the transaction unconditionally.
    #[external("private")]
    #[nophasecheck]
    fn sponsor_unconditionally() {
        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Sponsors the transaction unconditionally, but **always fails in teardown**.
    /// This is useful for testing teardown failure semantics without involving tokens.
    #[external("private")]
    #[nophasecheck]
    fn sponsor_unconditionally_teardown_revert() {
        // Teardown phase: intentionally revert.
        self.set_as_teardown(FeePayment::at(self.address)._teardown_always_revert());

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    #[external("private")]
    #[nophasecheck]
    fn sponsor_metered() {
        // Get the gas limits from the transaction settings.
        let l2_gas_limit = self.context.gas_settings().gas_limits.l2_gas;
        let da_gas_limit = self.context.gas_settings().gas_limits.da_gas;

        // Get the max fee per gas from the transaction settings.
        let max_fee_per_da_gas = self.context.gas_settings().max_fees_per_gas.fee_per_da_gas;
        let max_fee_per_l2_gas = self.context.gas_settings().max_fees_per_gas.fee_per_l2_gas;

        // Calculate the max gas cost (max fees are already validated in the transaction settings).
        let max_gas_cost = max_fee_per_da_gas * (da_gas_limit as u128)
            + max_fee_per_l2_gas * (l2_gas_limit as u128);

        // This logic is at setup phase, so if it reverts, the tx will be invalid (not included in the block).
        self.storage.fee_juice_balance.at(self.msg_sender().unwrap()).sub(max_gas_cost).deliver(
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    #[external("private")]
    #[nophasecheck]
    fn sponsor_metered_exact() {
        // Get the gas limits from the transaction settings.
        let l2_gas_limit = self.context.gas_settings().gas_limits.l2_gas;
        let da_gas_limit = self.context.gas_settings().gas_limits.da_gas;

        // Get the max fee per gas from the transaction settings.
        let max_fee_per_da_gas = self.context.gas_settings().max_fees_per_gas.fee_per_da_gas;
        let max_fee_per_l2_gas = self.context.gas_settings().max_fees_per_gas.fee_per_l2_gas;

        // Calculate the max gas cost (max fees are already validated in the transaction settings).
        let max_gas_cost = max_fee_per_da_gas * (da_gas_limit as u128)
            + max_fee_per_l2_gas * (l2_gas_limit as u128);

        // This logic is at setup phase, so if it reverts, the tx will be invalid (not included in the block).
        self.storage.fee_juice_balance.at(self.msg_sender().unwrap()).sub(max_gas_cost).deliver(
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );

        // Prepare the partial note for the refund.
        let to = self.context.msg_sender().unwrap();
        let partial_note = UintNote::partial(
            to,
            self.storage.fee_juice_balance.get_storage_slot(),
            self.context,
            to,
            self.address,
        );

        // This logic is at teardown phase, so if it reverts, the tx will be invalid (not included in the block).
        self.set_as_teardown(FeePayment::at(self.address)._refund(
            max_gas_cost,
            partial_note,
        ));

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    #[external("private")]
    #[nophasecheck]
    fn sponsor_metered_token(token_address: AztecAddress, nonce: Field) {
        // Get the gas limits from the transaction settings.
        let l2_gas_limit = self.context.gas_settings().gas_limits.l2_gas;
        let da_gas_limit = self.context.gas_settings().gas_limits.da_gas;

        // Get the max fee per gas from the transaction settings.
        let max_fee_per_da_gas = self.context.gas_settings().max_fees_per_gas.fee_per_da_gas;
        let max_fee_per_l2_gas = self.context.gas_settings().max_fees_per_gas.fee_per_l2_gas;

        // Calculate the max gas cost (max fees are already validated in the transaction settings).
        let max_gas_cost = max_fee_per_da_gas * (da_gas_limit as u128)
            + max_fee_per_l2_gas * (l2_gas_limit as u128);

        // This logic is at setup phase, so if it reverts, the tx will be invalid (not included in the block).
        self.call(Token::at(token_address).transfer_to_public(
            self.msg_sender().unwrap(),
            self.address,
            max_gas_cost,
            nonce,
        ));

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    #[external("private")]
    #[nophasecheck]
    fn sponsor_metered_token_exact(token_address: AztecAddress, nonce: Field) {
        // Get the gas limits from the transaction settings.
        let l2_gas_limit = self.context.gas_settings().gas_limits.l2_gas;
        let da_gas_limit = self.context.gas_settings().gas_limits.da_gas;

        // Get the max fee per gas from the transaction settings.
        let max_fee_per_da_gas = self.context.gas_settings().max_fees_per_gas.fee_per_da_gas;
        let max_fee_per_l2_gas = self.context.gas_settings().max_fees_per_gas.fee_per_l2_gas;

        // Calculate the max gas cost (max fees are already validated in the transaction settings).
        let max_gas_cost = max_fee_per_da_gas * (da_gas_limit as u128)
            + max_fee_per_l2_gas * (l2_gas_limit as u128);

        // This logic is at setup phase, so if it reverts, the tx will be invalid (not included in the block).
        let refund_commitment = self.call(Token::at(token_address)
            .transfer_to_public_and_prepare_private_balance_increase(
                self.msg_sender().unwrap(),
                self.address,
                max_gas_cost,
                nonce,
            ));

        // This logic is at teardown phase, so if it reverts, the tx will be invalid (not included in the block).
        self.set_as_teardown(FeePayment::at(self.address)._refund_token(
            token_address,
            max_gas_cost,
            refund_commitment,
        ));

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Sponsors the transaction by reserving max gas cost in tokens (same as `sponsor_metered_token`),
    /// but **always fails in teardown**. This is useful for testing teardown failure semantics.
    #[external("private")]
    #[nophasecheck]
    fn sponsor_metered_token_teardown_revert(token_address: AztecAddress, nonce: Field) {
        // Get the gas limits from the transaction settings.
        let l2_gas_limit = self.context.gas_settings().gas_limits.l2_gas;
        let da_gas_limit = self.context.gas_settings().gas_limits.da_gas;

        // Get the max fee per gas from the transaction settings.
        let max_fee_per_da_gas = self.context.gas_settings().max_fees_per_gas.fee_per_da_gas;
        let max_fee_per_l2_gas = self.context.gas_settings().max_fees_per_gas.fee_per_l2_gas;

        // Calculate the max gas cost (max fees are already validated in the transaction settings).
        let max_gas_cost = max_fee_per_da_gas * (da_gas_limit as u128)
            + max_fee_per_l2_gas * (l2_gas_limit as u128);

        // Setup phase: reserve max gas cost by transferring tokens from the tx sender to this contract.
        self.call(Token::at(token_address).transfer_to_public(
            self.msg_sender().unwrap(),
            self.address,
            max_gas_cost,
            nonce,
        ));

        // Teardown phase: intentionally revert. If this reverts, the tx should be invalid (not included in the block).
        self.set_as_teardown(FeePayment::at(self.address)._teardown_always_revert());

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    #[external("private")]
    fn mint_fee_juice(account: AztecAddress, amount: u128) {
        self.storage.fee_juice_balance.at(account).add(amount).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("public")]
    #[only_self]
    fn _refund(
        max_gas_cost: u128,
        partial_note: PartialUintNote,
    ) {
        let transaction_fee = self.context.transaction_fee();

        let refund_amount = max_gas_cost - (transaction_fee as u128);
        partial_note.complete(self.context, self.address, refund_amount);
    }

    #[external("public")]
    #[only_self]
    fn _refund_token(
        token_address: AztecAddress,
        max_gas_cost: u128,
        refund_commitment: PartialUintNote,
    ) {
        let transaction_fee = self.context.transaction_fee();

        let refund_amount = max_gas_cost - (transaction_fee as u128);
        self.call(Token::at(token_address).finalize_transfer_to_private(
            refund_amount,
            refund_commitment,
        ));
    }

    #[external("public")]
    #[only_self]
    fn _teardown_always_revert() {
        assert(false, "Intentional teardown revert");
    }

    #[external("utility")]
    unconstrained fn get_fee_juice_balance(account: AztecAddress) -> u128 {
        self.storage.fee_juice_balance.at(account).balance_of()
    }
}
