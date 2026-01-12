use dep::aztec::macros::aztec;

/// Metered Token Fee Payment Contract
/// Accepts tokens as payment for transaction fees.
/// Uses a 1:1 conversion rate (1 token = 1 FeeJuice equivalent).
#[aztec]
pub contract MeteredToken {
    use dep::aztec::{
        context::PrivateContext,
        macros::{functions::{external, initializer, nophasecheck, only_self}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::PublicImmutable,
    };
    use dep::token::Token;
    use dep::uint_note::uint_note::PartialUintNote;

    #[storage]
    struct Storage<Context> {
        token: PublicImmutable<AztecAddress, Context>,
    }

    /// Initialize with the accepted token address.
    #[external("public")]
    #[initializer]
    fn constructor(token_address: AztecAddress) {
        self.storage.token.initialize(token_address);
    }

    /// Sponsors the transaction by transferring tokens from sender.
    /// User must have approved this contract to transfer tokens (via authwit).
    /// NOTE: Does not refund unused tokens - the full max_gas_cost is consumed.
    ///
    /// @param nonce The nonce for the token transfer authorization
    #[external("private")]
    #[nophasecheck]
    fn pay_fee(nonce: Field) {
        let sender = self.context.msg_sender().unwrap();
        let token_address = self.storage.token.read();

        // Calculate the max gas cost (1:1 token conversion).
        let max_gas_cost = get_max_gas_cost(self.context);

        // NOTE: Setup phase should be ended AFTER the token transfer.
        //       Otherwise, APP_LOGIC_REVERTED txs will also rollback the token transfer.
        // TODO: Modify local-network to support the Token as allowed setup phase contract.
        self.context.set_as_fee_payer();
        self.context.end_setup();

        // Transfer tokens from sender to this contract.
        // This is in app logic phase, so not subject to setup allow list.
        // If transfer fails, the entire tx is invalid.
        self.call(Token::at(token_address).transfer_to_public(
            sender,
            self.address,
            max_gas_cost,
            nonce,
        ));
    }

    /// Sponsors the transaction with exact fee refunds.
    /// Transfers max tokens upfront, then refunds the difference in teardown.
    ///
    /// @param nonce The nonce for the token transfer authorization
    #[external("private")]
    #[nophasecheck]
    fn pay_fee_exact(nonce: Field) {
        let sender = self.context.msg_sender().unwrap();
        let token_address = self.storage.token.read();

        // Calculate the max gas cost (1:1 token conversion).
        let max_gas_cost = get_max_gas_cost(self.context);

        // NOTE: Setup phase should be ended AFTER the token transfer.
        //       Otherwise, APP_LOGIC_REVERTED txs will also rollback the token transfer.
        //       Because the Teardown phase depends on the App Logic phase, it'll revert with BOTH_REVERTED.
        // TODO: Modify local-network to support the Token as allowed setup phase contract.
        self.context.set_as_fee_payer();
        self.context.end_setup();

        // Transfer tokens and prepare refund commitment (app logic phase).
        let refund_commitment = self.call(Token::at(token_address)
            .transfer_to_public_and_prepare_private_balance_increase(
                sender,
                self.address,
                max_gas_cost,
                nonce,
            ));

        // Set teardown to refund any surplus tokens.
        self.set_as_teardown(MeteredToken::at(self.address)._refund_token(
            token_address,
            max_gas_cost,
            refund_commitment,
        ));
    }

    /// Teardown function to refund unused tokens.
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

    /// Returns the accepted token address.
    #[external("public")]
    fn get_token() -> AztecAddress {
        self.storage.token.read()
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
