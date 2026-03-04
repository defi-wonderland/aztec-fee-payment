// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ITopUp} from "./interfaces/ITopUp.sol";

/// @title TopUp
/// @notice Handles AZT token top-ups for Aztec FPC fee sponsorship.
///         Users approve this contract, call `topUp(from, amount)`, and the off-chain agent
///         processes the emitted `TopUp` events to generate authwits for Aztec minting.
contract TopUp is ITopUp {
    using SafeERC20 for IERC20;

    /*///////////////////////////////////////////////////////////////
                            STATE VARIABLES
    ///////////////////////////////////////////////////////////////*/

    /// @inheritdoc ITopUp
    address public immutable AZT_TOKEN;

    /// @inheritdoc ITopUp
    address public feeRecipient;

    /// @inheritdoc ITopUp
    address public pendingFeeRecipient;

    /*///////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    ///////////////////////////////////////////////////////////////*/

    /// @param _aztToken The AZT ERC20 token address.
    /// @param _feeRecipient The initial fee recipient address.
    /// @dev Zero-address validation for both parameters must be enforced in the deployment script.
    constructor(address _aztToken, address _feeRecipient) {
        AZT_TOKEN = _aztToken;
        feeRecipient = _feeRecipient;
    }

    /*///////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    ///////////////////////////////////////////////////////////////*/

    /// @inheritdoc ITopUp
    function topUp(address from, uint256 amount) external {
        IERC20(AZT_TOKEN).safeTransferFrom(msg.sender, feeRecipient, amount);

        emit TopUp(from, amount);
    }

    /// @inheritdoc ITopUp
    function proposeFeeRecipient(address newFeeRecipient) external {
        if (msg.sender != feeRecipient) revert TopUp_OnlyFeeRecipient();

        pendingFeeRecipient = newFeeRecipient;

        emit FeeRecipientTransferStarted(msg.sender, newFeeRecipient);
    }

    /// @inheritdoc ITopUp
    function acceptFeeRecipient() external {
        if (msg.sender != pendingFeeRecipient) revert TopUp_OnlyPendingFeeRecipient();

        address _previousRecipient = feeRecipient;

        feeRecipient = msg.sender;
        pendingFeeRecipient = address(0);

        emit FeeRecipientTransferred(_previousRecipient, msg.sender);
    }
}
