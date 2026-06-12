# Overview

This complete, end-to-end tutorial leverages your existing TypeScript knowledge. We will build a production-grade **Decentralized Crowdfunding Campaign** contract.

Instead of writing simple scripts, we will use **Hardhat**, **TypeScript**, and **Viem** (the modern, type-safe successor to ethers.js) to write comprehensive unit tests.

---

## 🏗️ Project Architecture & Concepts

Before writing code, it is vital to understand how data layout and security patterns operate on the Ethereum Virtual Machine (EVM).

### Key Concepts Implemented Below:

1. **The Pull over Push Pattern:** Instead of automatically sending funds to users if a campaign fails, we store their balances and have them *pull* (withdraw) their own funds. This prevents "DoS (Denial of Service) with Block Gas Limit" attacks.
2. **Storage Optimization:** We pack our `struct` properties tightly. In the EVM, storage slots are 32 bytes. Grouping `uint32` variables together allows the Solidity compiler to pack them into a single storage slot, drastically reducing gas costs for users.
3. **Explicit Data Locations (`memory` vs `storage`):** `storage` references points directly to the blockchain state (expensive mutations), while `memory` copies data into temporary runtime memory (cheap execution).

---

## 🛠️ Step 1: Environment Setup

Initialize your environment with Yarn and configure Hardhat for TypeScript and Viem.

Open your terminal and execute:

```bash
mkdir ts-crowdfund
cd ts-crowdfund
yarn init -y
yarn add --dev hardhat
yarn hardhat init

```

*Choose **"Create a TypeScript project (with Viem)"** when prompted.*

Your `package.json` will include `@nomicfoundation/hardhat-viem`, `typescript`, and `viem`.

---

## 📝 Step 2: The Solidity Smart Contract

Create a file named `contracts/Crowdfund.sol`. This contract allows a creator to launch a campaign with a funding goal and a deadline. If the goal isn't met by the deadline, contributors can claim a full refund.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

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

        // CEI Pattern: Zero out the balance balance before executing the transfer
        contributions[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit RefundClaimed(msg.sender, amount);
    }
}

```

Compile your contract to generate the artifacts and TypeChain types:

```bash
yarn hardhat compile

```

---

## 🧪 Step 3: Complete TypeScript Test Suite

Now we will build an enterprise-level test suite. We will test happy paths, custom error reversions, time-warping execution environments, and event emissions using **Viem** and native TypeScript features.

Create `test/Crowdfund.ts`:

```typescript
import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther, getAddress } from "viem";

describe("Crowdfund Contract", function () {
  // A reusable fixture to set up state before each test scenario
  async function deployCrowdfundFixture() {
    const [owner, contributor1, contributor2] = await hre.viem.getWalletClients();

    const targetGoal = parseEther("10"); // 10 ETH
    const duration = 3600; // 1 hour

    const crowdfund = await hre.viem.deployContract("Crowdfund", [
      targetGoal,
      duration,
    ]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      crowdfund,
      targetGoal,
      duration,
      owner,
      contributor1,
      contributor2,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct variables upon initialization", async function () {
      const { crowdfund, owner, targetGoal } = await deployCrowdfundFixture();

      expect(await crowdfund.read.creator()).to.equal(getAddress(owner.account.address));
      expect(await crowdfund.read.targetGoal()).to.equal(targetGoal);
      expect(await crowdfund.read.fundsWithdrawn()).to.be.false;
    });
  });

  describe("Contributions", function () {
    it("Should accept contributions and update contract state", async function () {
      const { crowdfund, contributor1, publicClient } = await deployCrowdfundFixture();
      const contributionAmount = parseEther("2");

      // Connect contributor client to execute transaction
      const crowdfundAsContributor = await hre.viem.getContractAt(
        "Crowdfund",
        crowdfund.address,
        { client: { wallet: contributor1 } }
      );

      await crowdfundAsContributor.write.contribute({ value: contributionAmount });

      // Assert state changes
      expect(await crowdfund.read.totalRaised()).to.equal(contributionAmount);
      expect(
        await crowdfund.read.contributions([contributor1.account.address])
      ).to.equal(contributionAmount);
    });

    it("Should revert if an account contributes 0 value", async function () {
      const { crowdfund, contributor1 } = await deployCrowdfundFixture();

      const crowdfundAsContributor = await hre.viem.getContractAt(
        "Crowdfund",
        crowdfund.address,
        { client: { wallet: contributor1 } }
      );

      // Verify custom error reversion with Viem syntax
      await expect(
        crowdfundAsContributor.write.contribute({ value: 0n })
      ).to.be.rejectedWith("ZeroContribution");
    });
  });

  describe("Withdrawals & Refunds (Time Dependent Steps)", function () {
    it("Should allow the creator to withdraw if target goal is met", async function () {
      const { crowdfund, owner, contributor1, duration } = await deployCrowdfundFixture();
      
      const crowdfundAsContributor = await hre.viem.getContractAt(
        "Crowdfund",
        crowdfund.address,
        { client: { wallet: contributor1 } }
      );

      // Send 10 ETH to satisfy target goal
      await crowdfundAsContributor.write.contribute({ value: parseEther("10") });

      // Fast forward EVM execution time past deadline block
      await time.increase(duration + 1);

      const crowdfundAsOwner = await hre.viem.getContractAt(
        "Crowdfund",
        crowdfund.address,
        { client: { wallet: owner } }
      );

      // Expect execution success
      await expect(crowdfundAsOwner.write.withdrawFunds()).to.eventually.be.fulfilled;
      expect(await crowdfund.read.fundsWithdrawn()).to.be.true;
    });

    it("Should allow users to pull refunds if campaign deadline passes and fails goal", async function () {
      const { crowdfund, contributor1, duration } = await deployCrowdfundFixture();

      const crowdfundAsContributor = await hre.viem.getContractAt(
        "Crowdfund",
        crowdfund.address,
        { client: { wallet: contributor1 } }
      );

      // Only contribute partial amount
      await crowdfundAsContributor.write.contribute({ value: parseEther("3") });

      // Fast-forward past deadline
      await time.increase(duration + 1);

      // Check balance updates upon claiming refund
      await expect(crowdfundAsContributor.write.claimRefund()).to.eventually.be.fulfilled;
      
      // Contributor ledger should be reset to zero mapping values
      expect(
        await crowdfund.read.contributions([contributor1.account.address])
      ).to.equal(0n);
    });
  });
});

```

Execute your test suite to run them against the local in-memory Hardhat Network:

```bash
yarn hardhat test

```

---

## 🚀 Step 4: Local Deployment Script

To complete the cycle, write a TypeScript deployment script to spin up the code on your local node instance.

Create `ignition/modules/Crowdfund.ts`:

```typescript
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const CrowdfundModule = buildModule("CrowdfundModule", (m) => {
  // Config parameters
  const targetGoal = m.getParameter("targetGoal", parseEther("5").toString());
  const duration = m.getParameter("duration", 3600); // 1 hour

  const crowdfund = m.contract("Crowdfund", [targetGoal, duration]);

  return { crowdfund };
});

export default CrowdfundModule;

```

### Run Everything Locally:

1. Open a separate terminal and launch your node:
```bash
yarn hardhat node

```


2. Run your deployment script against the active local node:
```bash
yarn hardhat ignition deploy ./ignition/modules/Crowdfund.ts --network localhost

```



You have now built, optimized, tested, and deployed a secure smart contract locally using a clean TypeScript environment.