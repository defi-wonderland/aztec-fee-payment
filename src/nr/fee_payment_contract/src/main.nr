use dep::aztec::macros::aztec;

/// Fee Payment Contract
/// This contract covers transaction fees for users.
#[aztec]
pub contract FeePayment {
    use dep::aztec::{
        macros::{functions::{external, nophasecheck, only_self}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::Owned,
    };
    use dep::balance_set::BalanceSet;

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
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );

        // This logic is at teardown phase, so if it reverts, the tx will be invalid (not included in the block).
        self.set_as_teardown(FeePayment::at(self.address)._validate_gas_cost(
            max_gas_cost,
            da_gas_limit,
            l2_gas_limit,
        ));

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
    fn _validate_gas_cost(max_gas_cost: u128, da_gas_limit: u32, l2_gas_limit: u32) {
        let base_fee_per_da_gas = self.context.base_fee_per_da_gas();
        let base_fee_per_l2_gas = self.context.base_fee_per_l2_gas();

        let da_gas_cost = base_fee_per_da_gas * (da_gas_limit as u128);
        let l2_gas_cost = base_fee_per_l2_gas * (l2_gas_limit as u128);

        assert(da_gas_cost + l2_gas_cost <= max_gas_cost, "Gas cost exceeds limit");
    }

    #[external("utility")]
    unconstrained fn get_fee_juice_balance(account: AztecAddress) -> u128 {
        self.storage.fee_juice_balance.at(account).balance_of()
    }
}
