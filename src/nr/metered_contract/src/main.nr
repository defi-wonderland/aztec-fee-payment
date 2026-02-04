use dep::aztec::macros::aztec;

/// Metered Fee Payment Contract
/// Tracks internal balances and deducts max gas cost per transaction.
/// Users must have sufficient balance to cover estimated fees.
#[aztec]
pub contract Metered {
    use dep::aztec::{
        authwit::auth::compute_inner_authwit_hash,
        context::PrivateContext,
        macros::{functions::{external, internal, nophasecheck, only_self}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::{
            address::AztecAddress,
            traits::{FromField, ToField},
        },
        state_vars::{Owned, state_variable::StateVariable},
    };
    use dep::balance_set::BalanceSet;
    use dep::uint_note::uint_note::{PartialUintNote, UintNote};

    // ============================================================================
    // TEST KEYS - For benchmarking/testing only
    // These must match the private keys used in benchmarks/signature.benchmark.ts
    // ============================================================================

    // Schnorr key pair (Grumpkin curve)
    // Derived from private key = 1 using Grumpkin scalar multiplication
    // G * 1 = G (generator point)
    // Grumpkin generator: x = 1, y = 0x2cf135e7506a45d632d270d45f1181294833fc48d823f272c
    global SCHNORR_PUBLIC_KEY_X: Field = 0x0000000000000000000000000000000000000000000000000000000000000001;
    global SCHNORR_PUBLIC_KEY_Y: Field = 0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c;

    // ECDSA key pair (secp256k1) - derived from private key = 1
    // This is the generator point G of secp256k1
    global ECDSA_PUBLIC_KEY_X: [u8; 32] = [
        0x79, 0xBE, 0x66, 0x7E, 0xF9, 0xDC, 0xBB, 0xAC,
        0x55, 0xA0, 0x62, 0x95, 0xCE, 0x87, 0x0B, 0x07,
        0x02, 0x9B, 0xFC, 0xDB, 0x2D, 0xCE, 0x28, 0xD9,
        0x59, 0xF2, 0x81, 0x5B, 0x16, 0xF8, 0x17, 0x98
    ];
    global ECDSA_PUBLIC_KEY_Y: [u8; 32] = [
        0x48, 0x3A, 0xDA, 0x77, 0x26, 0xA3, 0xC4, 0x65,
        0x5D, 0xA4, 0xFB, 0xFC, 0x0E, 0x11, 0x08, 0xA8,
        0xFD, 0x17, 0xB4, 0x48, 0xA6, 0x85, 0x54, 0x19,
        0x9C, 0x47, 0xD0, 0x8F, 0xFB, 0x10, 0xD4, 0xB8
    ];

    #[storage]
    struct Storage<Context> {
        balances: Owned<BalanceSet<Context>, Context>,
    }

    /// Sponsors the transaction by deducting max gas cost from sender's balance.
    /// If sender has insufficient balance, the transaction is invalid.
    /// NOTE: Does not refund unused gas - the full max_gas_cost is consumed.
    #[external("private")]
    #[nophasecheck]
    fn pay_fee() {
        let sender = self.context.msg_sender().unwrap();

        // Calculate the max gas cost from transaction settings.
        let max_gas_cost = get_max_gas_cost(self.context);

        // Deduct from sender's balance (reverts if insufficient).
        // This happens in setup phase - if it fails, tx is invalid.
        let balance_set = self.storage.balances.at(sender);
        let subtracted = balance_set.try_sub(max_gas_cost, 1);

        // try_sub may have subtracted more or less than amount. We must ensure that we subtracted at least as much as
        // we needed, and then create a new note for the owner for the change (if any).
        assert(subtracted >= max_gas_cost, "Balance too low or note insufficient");
        balance_set.add(subtracted - max_gas_cost).deliver(MessageDelivery.UNCONSTRAINED_ONCHAIN);

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Sponsors the transaction with exact fee refunds.
    /// Deducts max gas cost upfront, then refunds the difference in teardown.
    #[external("private")]
    #[nophasecheck]
    fn pay_fee_exact() {
        let sender = self.context.msg_sender().unwrap();

        // Calculate the max gas cost from transaction settings.
        let max_gas_cost = get_max_gas_cost(self.context);

        // Deduct from sender's balance using single note optimization (reverts if insufficient).
        // Use try_sub with max_notes = 1 to only read a single note, reducing proof generation time.
        let balance_set = self.storage.balances.at(sender);
        let subtracted = balance_set.try_sub(max_gas_cost, 1);

        // try_sub may have subtracted more or less than amount. We must ensure that we subtracted at least as much as
        // we needed, and then create a new note for the owner for the change (if any).
        assert(subtracted >= max_gas_cost, "Balance too low or note insufficient");
        balance_set.add(subtracted - max_gas_cost).deliver(MessageDelivery.UNCONSTRAINED_ONCHAIN);

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
        self.storage.balances.at(account).add(amount).deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    /// Teardown function to refund unused gas.
    #[external("public")]
    #[only_self]
    fn _refund(max_gas_cost: u128, partial_note: PartialUintNote) {
        let transaction_fee = self.context.transaction_fee();
        let refund_amount = max_gas_cost - (transaction_fee as u128);
        partial_note.complete(self.context, self.address, refund_amount);
    }

    /// @notice Verify that the tx_hash and amount given to mint have been approved by the FPC
    /// @param tx_hash Truncated L1 hash of the transaction containing the AZT transfer
    /// @param amount The amount of wFJ to mint
    /// @param signature The signature
    #[internal("private")]
    fn _verify_schnorr_signature(tx_hash: Field, amount: u128, signature: [u8; 64]) {
        let message_hash = compute_inner_authwit_hash([
            tx_hash, 
            amount as Field,  
            self.address.to_field(),
            self.context.chain_id()
        ]);

        let pub_key = std::embedded_curve_ops::EmbeddedCurvePoint {
            x: SCHNORR_PUBLIC_KEY_X,
            y: SCHNORR_PUBLIC_KEY_Y,
            is_infinite: false,
        };
        // Verify signature of the payload bytes
        let is_valid_signature: bool = schnorr::verify_signature(pub_key, signature, message_hash.to_be_bytes::<32>());
        assert(is_valid_signature, "Message not authorized by account");

        // Nullify message_hash so that the same signature cannot be used twice
        self.context.push_nullifier(message_hash);
    }

    /// @notice Verify that the tx_hash and amount given to mint have been approved by the FPC
    /// @param tx_hash Truncated L1 hash of the transaction containing the AZT transfer
    /// @param amount The amount of wFJ to mint
    /// @param signature The signature
    #[internal("private")]
    fn _verify_ecdsa_signature(tx_hash: Field, amount: u128, signature: [u8; 64]) {
        let message_hash = compute_inner_authwit_hash([
            tx_hash, 
            amount as Field, 
            self.address.to_field(),
            self.context.chain_id()
        ]);
        
        // Verify signature of the payload bytes
        let message_hash_bytes: [u8; 32] = message_hash.to_be_bytes();
        let hashed_message: [u8; 32] = sha256::digest(message_hash_bytes);
        let is_valid_signature: bool = std::ecdsa_secp256k1::verify_signature(ECDSA_PUBLIC_KEY_X, ECDSA_PUBLIC_KEY_Y, signature, hashed_message);
        assert(is_valid_signature, "Message not authorized by account");

        // Nullify message_hash so that the same signature cannot be used twice
        self.context.push_nullifier(message_hash);
    }

    /// @notice External wrapper for benchmarking Schnorr signature verification
    /// @param tx_hash Truncated L1 hash of the transaction
    /// @param amount The amount value
    /// @param signature The Schnorr signature (64 bytes)
    #[external("private")]
    fn verify_schnorr_signature(tx_hash: Field, amount: u128, signature: [u8; 64]) {
        self.internal._verify_schnorr_signature(tx_hash, amount, signature);
    }

    /// @notice External wrapper for benchmarking ECDSA signature verification
    /// @param tx_hash Truncated L1 hash of the transaction
    /// @param amount The amount value
    /// @param signature The ECDSA signature (64 bytes: r || s)
    #[external("private")]
    fn verify_ecdsa_signature(tx_hash: Field, amount: u128, signature: [u8; 64]) {
        self.internal._verify_ecdsa_signature(tx_hash, amount, signature);
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
