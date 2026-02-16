use dep::aztec::macros::aztec;

/// Metered Fee Payment Contract (Phase 2)
/// Tracks internal balances and deducts max gas cost per transaction.
/// Users obtain authwits from the Service Provider's off-chain agent and call
/// mint(amount, secret) to credit their balance. The FPC self-sponsors mint
/// transactions, solving the cold-start problem (users need no FJ to mint).
#[aztec]
pub contract Metered {
    use dep::aztec::{
        authwit::auth::{assert_inner_hash_valid_authwit, compute_inner_authwit_hash},
        context::PrivateContext,
        macros::{
            functions::{external, initializer, nophasecheck, only_self},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{Owned, PublicImmutable, state_variable::StateVariable},
    };
    use dep::balance_set::BalanceSet;
    use dep::uint_note::uint_note::{PartialUintNote, UintNote};

    #[storage]
    struct Storage<Context> {
        owner: PublicImmutable<AztecAddress, Context>,
        balances: Owned<BalanceSet<Context>, Context>,
    }

    /// Initializes the contract with the owner (Service Provider) address.
    /// The owner's account contract verifies authwits for minting.
    #[external("public")]
    #[initializer]
    fn initialize(owner: AztecAddress) {
        assert(!owner.is_zero(), "Owner address cannot be zero");
        self.storage.owner.initialize(owner);
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

    /// Mints internal balance using a custom authwit signed by the owner (Service Provider).
    /// The FPC self-sponsors this transaction, deducting gas cost from the minted amount.
    /// SP never learns the caller's Aztec address — tokens are credited to msg_sender.
    ///
    /// Execution order (critical for griefing prevention):
    /// 1. Validate authwit (calls owner's account contract)
    /// 2. Push authwit nullifier (replay prevention) — BEFORE set_as_fee_payer
    /// 3. set_as_fee_payer() — FPC commits to pay only after validation
    /// 4. end_setup()
    /// 5. Mint (amount - max_gas_cost) to msg_sender
    #[external("private")]
    #[nophasecheck]
    fn mint(amount: u128, secret: Field) {
        let sender = self.context.msg_sender().unwrap();

        // Validate the mint amount covers gas cost before consuming the authwit.
        let max_gas_cost = get_max_gas_cost(self.context);
        assert(amount >= max_gas_cost, "Mint amount does not cover gas cost");

        // Read the owner from public immutable storage (historical read in private context).
        let owner = self.storage.owner.read();

        // Compute custom inner hash: H(amount, secret).
        // This matches the off-chain agent's computeInnerAuthWitHash([amount, secret]).
        let inner_hash = compute_inner_authwit_hash([amount as Field, secret]);

        // Verify the authwit against the owner's account contract AND push a nullifier
        // for replay prevention. The nullifier is pushed here — BEFORE set_as_fee_payer() —
        // to prevent griefing attacks where an attacker replays a used authwit to force
        // the FPC to pay gas on a transaction that will fail.
        assert_inner_hash_valid_authwit(self.context, owner, inner_hash);

        // Self-sponsor: FPC pays for this transaction, solving the cold-start problem
        // (user has no FJ to pay for the mint transaction itself).
        self.context.set_as_fee_payer();

        // End the setup phase — from here, side effects are revertible.
        self.context.end_setup();

        // Credit (amount - max_gas_cost) to msg_sender's balance.
        let net_amount = amount - max_gas_cost;
        self.storage.balances.at(sender).add(net_amount).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
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
