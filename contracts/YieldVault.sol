// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title YieldVault
 * @notice An advanced, secure vault managing yield-bearing tokenized shares.
 */
contract YieldVault {
    IERC20 public immutable asset;

    string public name;
    string public symbol;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event YieldDistributed(uint256 amount);

    error ZeroAssets();
    error ZeroShares();
    error TransferFailed();

    constructor(address _asset, string memory _name, string memory _symbol) {
        asset = IERC20(_asset);
        name = _name;
        symbol = _symbol;
    }

    /**
     * @notice Returns the total amount of underlying assets managed by the vault.
     */
    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /**
     * @notice Converts asset amounts to equivalent share amounts. Implements virtual math.
     */
    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * (totalSupply + 1)) / (totalAssets() + 1);
    }

    /**
     * @notice Converts share amounts to equivalent asset amounts. Implements virtual math.
     */
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * (totalAssets() + 1)) / (totalSupply + 1);
    }

    /**
     * @notice Deposits underlying assets into the vault and mints shares to the user.
     */
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAssets();
        
        shares = convertToShares(assets);
        if (shares == 0) revert ZeroShares();

        // Execution Check: Pull assets first
        bool success = asset.transferFrom(msg.sender, address(this), assets);
        if (!success) revert TransferFailed();

        // Effects: Mutate internal state
        totalSupply += shares;
        balanceOf[receiver] += shares;

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /**
     * @notice Redeems shares from the vault and sends underlying assets back to the receiver.
     */
    function withdraw(uint256 shares, address receiver) external returns (uint256 assets) {
        if (shares == 0) revert ZeroShares();
        if (balanceOf[msg.sender] < shares) revert ZeroShares();

        assets = convertToAssets(shares);
        if (assets == 0) revert ZeroAssets();

        // Effects: Mutate internal state before external call (CEI Pattern)
        balanceOf[msg.sender] -= shares;
        totalSupply -= shares;

        // Interaction: Send assets back to user
        bool success = asset.transfer(receiver, assets);
        if (!success) revert TransferFailed();

        emit Withdraw(msg.sender, receiver, assets, shares);
    }

    /**
     * @notice Simulates yield entering the system (e.g., from an external lending engine).
     * @dev For testing purposes, external entities transfer funds to the vault directly.
     */
    function simulateYieldProduction(uint256 amount) external {
        bool success = asset.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        emit YieldDistributed(amount);
    }
}