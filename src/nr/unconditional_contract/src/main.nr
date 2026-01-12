use dep::aztec::macros::aztec;

/// Unconditional Fee Payment Contract
/// Sponsors transaction fees without any conditions.
#[aztec]
pub contract Unconditional {
    use dep::aztec::macros::functions::{external, nophasecheck};

    /// Sponsors the transaction unconditionally.
    /// The contract pays all fees - user pays nothing.
    #[external("private")]
    #[nophasecheck]
    fn pay_fee() {
        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }
}
