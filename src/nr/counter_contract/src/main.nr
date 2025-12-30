use aztec::macros::aztec;
pub mod test;

#[aztec]
pub contract Counter {
    // aztec library imports
    use aztec::{
        macros::{functions::{external, initializer, only_self, view}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::{PublicImmutable, PublicMutable},
    };

    // @param owner The address of the owner
    // @param counter A numerical value
    #[storage]
    struct Storage<Context> {
        owner: PublicImmutable<AztecAddress, Context>,
        counter: PublicMutable<u128, Context>,
    }

    /// @dev Initialize the contract
    /// @param owner The address of the owner
    #[external("public")]
    #[initializer]
    fn constructor(owner: AztecAddress) {
        self.storage.owner.initialize(owner);
    }

    /// @dev Retrieves the owner of the contract
    /// @return The owner of the contract
    #[external("public")]
    fn get_owner() -> AztecAddress {
        self.storage.owner.read()
    }

    /// @dev Increments the counter
    #[external("private")]
    fn increment() {
        self.enqueue_self._increment();
    }

    /// @dev Resets the counter
    #[external("private")]
    fn reset() {
        self.enqueue_self._reset();
    }

    #[external("private")]
    fn revert_private() {
        let version = self.context.version();
        assert(version == 0, "Reverted");
    }

    #[external("private")]
    fn revert_public() {
        self.enqueue_self._revert_public();
    }

    #[external("public")]
    #[only_self]
    fn _revert_public() {
        let version = self.context.version();
        assert(version == 0, "Reverted");
    }

    /// @dev Retrieves the counter value
    /// @return The current counter value
    #[external("public")]
    #[view]
    fn get_counter() -> u128 {
        self.storage.counter.read()
    }

    /// @dev Increments the counter
    #[external("public")]
    #[only_self]
    fn _increment() {
        let current_value = self.storage.counter.read();
        self.storage.counter.write(current_value + 1);
    }

    /// @dev Resets the counter
    #[external("public")]
    #[only_self]
    fn _reset() {
        self.storage.counter.write(0);
    }
}
