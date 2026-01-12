use aztec::macros::aztec;

#[aztec]
pub contract Counter {
    use aztec::{
        macros::{functions::{external, only_self, view}, storage::storage},
        state_vars::PublicMutable,
    };

    #[storage]
    struct Storage<Context> {
        counter: PublicMutable<u128, Context>,
    }

    /// @dev Increments the counter (private -> public)
    #[external("private")]
    fn increment() {
        self.enqueue_self._increment();
    }

    /// @dev Resets the counter (private -> public)
    #[external("private")]
    fn reset() {
        self.enqueue_self._reset();
    }

    /// @dev Triggers a public revert (for testing app logic revert scenarios)
    #[external("private")]
    fn revert_public() {
        self.enqueue_self._revert_public();
    }

    /// @dev Retrieves the counter value
    #[external("public")]
    #[view]
    fn get_counter() -> u128 {
        self.storage.counter.read()
    }

    #[external("public")]
    #[only_self]
    fn _increment() {
        let current_value = self.storage.counter.read();
        self.storage.counter.write(current_value + 1);
    }

    #[external("public")]
    #[only_self]
    fn _reset() {
        self.storage.counter.write(0);
    }

    #[external("public")]
    #[only_self]
    fn _revert_public() {
        let version = self.context.version();
        assert(version == 0, "Reverted");
    }
}
