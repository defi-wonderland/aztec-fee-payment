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
        oracle::auth_witness::get_auth_witness,
        protocol_types::{address::AztecAddress, hash::poseidon2_hash, traits::{FromField, ToField}},
        state_vars::{Owned, state_variable::StateVariable},
    };
    use dep::balance_set::BalanceSet;
    use dep::uint_note::uint_note::{PartialUintNote, UintNote};

    // ============================================================================
    // TEST KEYS - For benchmarking/testing only
    // These must match the private keys used in benchmarks/signature.benchmark.ts
    // ============================================================================

    // ECDSA key pair (secp256k1) - derived from private key = 1
    // This is the generator point G of secp256k1
    global ECDSA_PUBLIC_KEY_X: [u8; 32] = [
        0x79, 0xBE, 0x66, 0x7E, 0xF9, 0xDC, 0xBB, 0xAC, 0x55, 0xA0, 0x62, 0x95, 0xCE, 0x87, 0x0B,
        0x07, 0x02, 0x9B, 0xFC, 0xDB, 0x2D, 0xCE, 0x28, 0xD9, 0x59, 0xF2, 0x81, 0x5B, 0x16, 0xF8,
        0x17, 0x98,
    ];
    global ECDSA_PUBLIC_KEY_Y: [u8; 32] = [
        0x48, 0x3A, 0xDA, 0x77, 0x26, 0xA3, 0xC4, 0x65, 0x5D, 0xA4, 0xFB, 0xFC, 0x0E, 0x11, 0x08,
        0xA8, 0xFD, 0x17, 0xB4, 0x48, 0xA6, 0x85, 0x54, 0x19, 0x9C, 0x47, 0xD0, 0x8F, 0xFB, 0x10,
        0xD4, 0xB8,
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

    /// Mints tokens and pays fee in a single transaction.
    /// Verifies ECDSA signature, mints the specified amount, then deducts max gas cost.
    /// The minted amount must be >= max_gas_cost.
    /// @param account The address to mint tokens to
    /// @param amount The amount to mint
    /// @param mint_id Unique identifier for this mint operation to enforce uniqueness
    #[external("private")]
    #[nophasecheck]
    fn mint_and_pay_fee(account: AztecAddress, amount: u128, mint_id: Field) {
        self.internal._verify_ecdsa_signature(mint_id, amount);

        // Calculate the max gas cost from transaction settings.
        let max_gas_cost = get_max_gas_cost(self.context);

        self.storage.balances.at(account).add(amount - max_gas_cost).deliver(
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Mints tokens and pays fee, with fallback to existing balance.
    /// Verifies ECDSA signature, mints the specified amount, then deducts max gas cost.
    /// If minted amount >= max_gas_cost, no existing balance is needed.
    /// If minted amount < max_gas_cost, the difference is deducted from existing balance.
    /// @param account The address to mint tokens to
    /// @param amount The amount to mint
    /// @param mint_id Unique identifier for this mint operation to enforce uniqueness
    #[external("private")]
    #[nophasecheck]
    fn mint_and_pay_fee_with_balance(account: AztecAddress, amount: u128, mint_id: Field) {
        // Verify the signature authorizing this mint
        self.internal._verify_ecdsa_signature(mint_id, amount);

        let balance_set = self.storage.balances.at(account);

        // Calculate the max gas cost from transaction settings.
        let max_gas_cost = get_max_gas_cost(self.context);

        if max_gas_cost > amount {
            // Need to deduct additional from account's existing balance
            let deficit = max_gas_cost - amount;
            let subtracted = balance_set.try_sub(deficit, 1);

            // Ensure we subtracted enough
            assert(subtracted >= deficit, "Balance too low or note insufficient");
            // Return any excess from the subtraction
            balance_set.add(subtracted - deficit).deliver(MessageDelivery.UNCONSTRAINED_ONCHAIN);
        } else {
            // Minted amount covers gas, add the surplus to balance
            balance_set.add(amount - max_gas_cost).deliver(MessageDelivery.UNCONSTRAINED_ONCHAIN);
        }

        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
        // End the setup phase
        self.context.end_setup();
    }

    /// Mints internal balance to an account.
    /// Requires ECDSA signature verification.
    /// @param account The address to mint tokens to
    /// @param amount The amount to mint
    /// @param mint_id Unique identifier for this mint operation to enforce uniqueness
    #[external("private")]
    fn mint(account: AztecAddress, amount: u128, mint_id: Field) {
        self.internal._verify_ecdsa_signature(mint_id, amount);
        self.storage.balances.at(account).add(amount).deliver(MessageDelivery.UNCONSTRAINED_ONCHAIN);
    }

    /// Teardown function to refund unused gas.
    #[external("public")]
    #[only_self]
    fn _refund(max_gas_cost: u128, partial_note: PartialUintNote) {
        let transaction_fee = self.context.transaction_fee();
        let refund_amount = max_gas_cost - (transaction_fee as u128);
        partial_note.complete(self.context, self.address, refund_amount);
    }

    /// @notice Verify ECDSA signature fetched via auth_witness oracle.
    /// The signature is retrieved using message_hash as the lookup key.
    /// The signature itself is nullified (via Poseidon2 hash) to prevent replay.
    /// @param mint_id Unique identifier for this mint operation to enforce uniqueness
    /// @param amount The amount value
    #[internal("private")]
    fn _verify_ecdsa_signature(mint_id: Field, amount: u128) {
        let message_hash = compute_inner_authwit_hash([
            mint_id,
            amount as Field,
            self.address.to_field(),
            self.context.chain_id(),
            self.context.version(),
        ]);

        // Fetch signature from auth witness oracle using message_hash as key
        let witness: [Field; 64] = unsafe { get_auth_witness(message_hash) };
        // Nullify the signature to prevent replay attacks
        self.context.push_nullifier(poseidon2_hash(witness));

        let mut signature: [u8; 64] = [0; 64];
        for i in 0..64 {
            signature[i] = witness[i] as u8;
        }

        // Verify signature of the payload bytes
        let message_hash_bytes: [u8; 32] = message_hash.to_be_bytes();
        let hashed_message: [u8; 32] = sha256::digest(message_hash_bytes);
        let is_valid_signature: bool = std::ecdsa_secp256k1::verify_signature(
            ECDSA_PUBLIC_KEY_X,
            ECDSA_PUBLIC_KEY_Y,
            signature,
            hashed_message,
        );
        assert(is_valid_signature, "Message not authorized by account");
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
