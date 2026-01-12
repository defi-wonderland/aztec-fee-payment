use dep::aztec::macros::aztec;

/// Per-Class-ID Fee Payment Contract
/// Sponsors transaction fees only for accounts of a specific contract class.
#[aztec]
pub contract PerClassId {
    use dep::aztec::{
        macros::{functions::{external, initializer, nophasecheck}, storage::storage},
        oracle::get_contract_instance::get_contract_instance,
        protocol_types::contract_class_id::ContractClassId,
        state_vars::PublicImmutable,
    };

    #[storage]
    struct Storage<Context> {
        allowed_class_id: PublicImmutable<ContractClassId, Context>,
    }

    /// Initialize with the allowed contract class ID.
    /// Only accounts deployed from this class will be sponsored.
    #[external("public")]
    #[initializer]
    fn constructor(allowed_class_id: ContractClassId) {
        self.storage.allowed_class_id.initialize(allowed_class_id);
    }

    /// Sponsors the transaction if sender's class ID matches the allowed class.
    #[external("private")]
    #[nophasecheck]
    fn pay_fee() {
        let sender = self.context.msg_sender().unwrap();

        // Verify sender's contract class ID
        let instance = get_contract_instance(sender);
        let sender_class_id = instance.contract_class_id;

        // Read the allowed class ID and assert match
        let allowed = self.storage.allowed_class_id.read();
        assert(sender_class_id == allowed, "Sender is not from the allowed contract class");

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Returns the allowed contract class ID.
    #[external("public")]
    fn get_allowed_class_id() -> ContractClassId {
        self.storage.allowed_class_id.read()
    }
}
