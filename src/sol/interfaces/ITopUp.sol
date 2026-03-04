// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title ITopUp
/// @notice Interface for the TopUp contract that handles AZT token top-ups for Aztec FPC sponsorship.
interface ITopUp {
    /*///////////////////////////////////////////////////////////////
                                EVENTS
    ///////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a user tops up AZT for Aztec fee sponsorship.
    /// @param from The logical payer address (used for secret derivation and EIP-712 authorization).
    /// @param amount The amount of AZT tokens transferred.
    event TopUp(address indexed from, uint256 amount);

    /// @notice Emitted when a new fee recipient is nominated.
    /// @param currentRecipient The current fee recipient who initiated the transfer.
    /// @param pendingRecipient The nominated new fee recipient.
    event FeeRecipientTransferStarted(address indexed currentRecipient, address indexed pendingRecipient);

    /// @notice Emitted when the pending fee recipient accepts the role.
    /// @param previousRecipient The previous fee recipient.
    /// @param newRecipient The new fee recipient.
    event FeeRecipientTransferred(address indexed previousRecipient, address indexed newRecipient);

    /*///////////////////////////////////////////////////////////////
                                ERRORS
    ///////////////////////////////////////////////////////////////*/

    /// @notice Thrown when the caller is not the current fee recipient.
    error TopUp_OnlyFeeRecipient();

    /// @notice Thrown when the caller is not the pending fee recipient.
    error TopUp_OnlyPendingFeeRecipient();

    /*///////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    ///////////////////////////////////////////////////////////////*/

    /// @notice Transfers AZT from the caller to the fee recipient and emits a TopUp event.
    /// @dev The caller must have approved this contract to spend at least `amount` AZT.
    ///      The `from` parameter is the logical payer used for off-chain authorization — it
    ///      does not need to match `msg.sender`.
    /// @param from The logical payer address (matched against EIP-712 signer by the off-chain agent).
    /// @param amount The amount of AZT tokens to transfer.
    function topUp(address from, uint256 amount) external;

    /// @notice Proposes a new fee recipient. Only callable by the current fee recipient.
    /// @dev The proposed recipient must call `acceptFeeRecipient()` to complete the transfer.
    /// @param newFeeRecipient The address proposed to become the new fee recipient.
    function proposeFeeRecipient(address newFeeRecipient) external;

    /// @notice Accepts the fee recipient role. Only callable by the pending fee recipient.
    function acceptFeeRecipient() external;

    /*///////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    ///////////////////////////////////////////////////////////////*/

    /// @notice Returns the AZT token address.
    /// @return The ERC20 token address used for top-ups.
    function AZT_TOKEN() external view returns (address);

    /// @notice Returns the current fee recipient address.
    /// @return The address that receives AZT tokens from top-ups.
    function feeRecipient() external view returns (address);

    /// @notice Returns the pending fee recipient address.
    /// @return The address nominated to become the next fee recipient (zero if none).
    function pendingFeeRecipient() external view returns (address);
}
