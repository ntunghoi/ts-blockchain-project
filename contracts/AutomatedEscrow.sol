// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface AutomationCompatibleInterface {
    function checkUpkeep(
        bytes calldata checkData
    ) external view returns (bool upkeepNeeded, bytes memory performData);

    function performUpkeep(bytes calldata performData) external;
}

/**
 * @title AutomatedEscrow
 * @notice Automatically refunds deposits to the depositor if the release deadline expires without action.
 */
contract AutomatedEscrow is AutomationCompatibleInterface {
    struct Vault {
        address depositor;
        address beneficiary;
        uint256 amount;
        uint32 deadline;
        bool isSettled;
    }

    Vault[] public vaults;

    event EscrowCreated(
        uint256 indexed vaultId,
        address depositor,
        address beneficiary,
        uint256 amount
    );
    event EscrowLiquidated(
        uint256 indexed vaultId,
        address indexed receiptent,
        uint256 amount
    );

    error NoUpkeepNeeded();
    error TransferFailed();

    function createEscrow(
        address _beneficiary,
        uint32 _durationSeconds
    ) external payable {
        vaults.push(
            Vault({
                depositor: msg.sender,
                beneficiary: _beneficiary,
                amount: msg.value,
                deadline: uint32(block.timestamp + _durationSeconds),
                isSettled: false
            })
        );

        emit EscrowCreated(
            vaults.length - 1,
            msg.sender,
            _beneficiary,
            msg.value
        );
    }

    /**
     * @notice Checked off-chain by Chainlink Nodes constantly at zero gas cost.
     * @dev Loops through active vaults to verify if any have breached their deadline.
     */
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256 length = vaults.length;
        for (uint256 i = 0; i < length; i++) {
            if (
                !vaults[i].isSettled &&
                block.timestamp >= vaults[i].deadline &&
                vaults[i].amount > 0
            ) {
                // Condition met! Return true and encode the target index inside performData
                return (true, abi.encode(i));
            }
        }

        return (false, '');
    }

    /**
     * @notice Executed on-chain by the Automation Network ONLY when checkUpkeep returns true.
     */
    function performUpkeep(bytes calldata performData) external override {
        uint256 vaultId = abi.decode(performData, (uint256));

        // Re-verify condition on-cache for defense-in-depth security
        Vault storage targetVault = vaults[vaultId];
        if (
            targetVault.isSettled ||
            block.timestamp < targetVault.deadline ||
            targetVault.amount == 0
        ) {
            revert NoUpkeepNeeded();
        }

        // Effects
        targetVault.isSettled = true;
        uint256 refundAmount = targetVault.amount;
        targetVault.amount = 0;

        // Interaction
        (bool success, ) = targetVault.depositor.call{value: refundAmount}('');
        if (!success) revert TransferFailed();

        emit EscrowLiquidated(vaultId, targetVault.depositor, refundAmount);
    }
}
