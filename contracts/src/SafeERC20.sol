// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC20.sol";

/// @title SafeERC20
/// @notice Minimal safe-transfer wrapper, mirroring OpenZeppelin's SafeERC20.
///         A bare `IERC20(token).transfer(...)` with the return value ignored
///         will silently treat a `false` result as success — real risk on a
///         contract holding pooled user funds, since not every ERC20 (legacy
///         tokens in particular) reverts on failure. This also tolerates
///         tokens that return no data at all instead of reverting outright.
library SafeERC20 {
    error TransferFailed();

    function safeTransfer(IERC20 token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
