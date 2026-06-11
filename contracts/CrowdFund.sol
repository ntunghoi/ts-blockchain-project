// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "hardhat/console.sol";

/**
 * @title Crowdfund
 * @dev A secure, gas-optimized crowdfunding contract demonstrating Web3 best practices.
 */
contract Crowdfund {
    // --- State Variables ---
    address public immutable creator;
    uint256 public immutable targetGoal;
    uint32 public immutable deadline; // Packed tightly alongside booleans if expanded
    
    uint256 public totalRaised;
    bool public fundsWithdrawn;

    // Mapping of contributor address to their total contribution amount
    mapping(address => uint256) public contributions;

    // --- Events ---
    // Emitting events allows your TypeScript frontend or subgraph to listen to blockchain indexing state
    event Contributed(address indexed contributor, uint256 amount);
    event FundsWithdrawn(address indexed creator, uint256 amount);
    event RefundClaimed(address indexed contributor, uint256 amount);

    // --- Modifiers ---
    modifier onlyCreator() {
        if (msg.sender != creator) revert NotCreator();
        _;
    }

    // --- Custom Errors (Gas Efficient alternatives to require strings) ---
    error NotCreator();
    error CampaignActive();
    error CampaignEnded();
    error GoalNotMet();
    error GoalAlreadyMet();
    error ZeroContribution();
    error NoFundsToRefund();
    error AlreadyWithdrawn();
    error TransferFailed();

    /**
     * @param _targetGoal The funding target in Wei (e.g., 10 * 10^18 for 10 ETH)
     * @param _durationInSeconds How long the campaign will remain active
     */
    constructor(uint256 _targetGoal, uint32 _durationInSeconds) {
        creator = msg.sender;
        targetGoal = _targetGoal;
        deadline = uint32(block.timestamp + _durationInSeconds);
    }

    /**
     * @notice Allows users to contribute test ETH to the campaign.
     */
    function contribute() external payable {
        if (block.timestamp >= deadline) revert CampaignEnded();
        if (msg.value == 0) revert ZeroContribution();

        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;

        emit Contributed(msg.sender, msg.value);
    }

    /**
     * @notice Allows the creator to claim funds if the target goal is met or exceeded.
     */
    function withdrawFunds() external onlyCreator {
        if (block.timestamp < deadline) revert CampaignActive();
        if (totalRaised < targetGoal) revert GoalNotMet();
        if (fundsWithdrawn) revert AlreadyWithdrawn();

        fundsWithdrawn = true;
        uint256 amount = totalRaised;

        // CEI Pattern: State change happens BEFORE external transfer
        (bool success, ) = creator.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit FundsWithdrawn(creator, amount);
    }

    /**
     * @notice Allows contributors to safely pull their funds if the campaign fails.
     */
    function claimRefund() external {
        if (block.timestamp < deadline) revert CampaignActive();
        if (totalRaised >= targetGoal) revert GoalAlreadyMet();

        uint256 amount = contributions[msg.sender];
        if (amount == 0) revert NoFundsToRefund();

        // CEI Pattern: Zero out the balance before executing the transfer
        contributions[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit RefundClaimed(msg.sender, amount);
    }
}