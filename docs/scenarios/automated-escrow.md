Executing a smart contract automatically when specific conditions are met is a foundational Web3 pattern. Because the EVM is inherently reactive—meaning contracts cannot run background cron jobs or "listen" passively without an external transaction to trigger state changes—this pattern requires an offchain executor called a **Keeper** or **Automation Network**.

The gold standard for decentralized, conditional execution is **Chainlink Automation**. It works by exposing a `checkUpkeep` view function (evaluated offchain for free by nodes) that triggers a state-changing `performUpkeep` function on-chain when conditions are met.

---

## 🏢 Real Case Scenario: Liquidation Bot for an Escrow Vault

We will implement an automated **Escrow Vault**.

* **The Rules:** A seller deposits funds for a buyer. The buyer must claim the funds before an expiration timestamp. If they fail to do so, the contract meets a *breach condition*.
* **The Automation:** The contract detects the condition has been met, automatically liquidates/returns the funds to the original seller, and penalizes the expired profile.

---

## 📝 1. The Smart Contract (`contracts/AutomatedEscrow.sol`)

This contract implements the `AutomationCompatibleInterface`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
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

    event EscrowCreated(uint256 indexed vaultId, address depositor, address beneficiary, uint256 amount);
    event EscrowLiquidated(uint256 indexed vaultId, address indexed recipient, uint256 amount);

    error NoUpkeepNeeded();
    error TransferFailed();

    function createEscrow(address _beneficiary, uint32 _durationSeconds) external payable {
        vaults.push(Vault({
            depositor: msg.sender,
            beneficiary: _beneficiary,
            amount: msg.value,
            deadline: uint32(block.timestamp + _durationSeconds),
            isSettled: false
        }));

        emit EscrowCreated(vaults.length - 1, msg.sender, _beneficiary, msg.value);
    }

    /**
     * @notice Checked off-chain by Chainlink Nodes constantly at zero gas cost.
     * @dev Loops through active vaults to verify if any have breached their deadline.
     */
    function checkUpkeep(bytes calldata /* checkData */) 
        external 
        view 
        override 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        uint256 length = vaults.length;
        for (uint256 i = 0; i < length; i++) {
            if (!vaults[i].isSettled && block.timestamp >= vaults[i].deadline && vaults[i].amount > 0) {
                // Condition met! Return true and encode the target index inside performData
                return (true, abi.encode(i));
            }
        }
        return (false, "");
    }

    /**
     * @notice Executed on-chain by the Automation Network ONLY when checkUpkeep returns true.
     */
    function performUpkeep(bytes calldata performData) external override {
        uint256 vaultId = abi.decode(performData, (uint256));
        
        // Re-verify condition on-chain for defense-in-depth security
        Vault storage targetVault = vaults[vaultId];
        if (targetVault.isSettled || block.timestamp < targetVault.deadline || targetVault.amount == 0) {
            revert NoUpkeepNeeded();
        }

        // Effects
        targetVault.isSettled = true;
        uint256 refundAmount = targetVault.amount;
        targetVault.amount = 0;

        // Interactions
        (bool success, ) = targetVault.depositor.call{value: refundAmount}("");
        if (!success) revert TransferFailed();

        emit EscrowLiquidated(vaultId, targetVault.depositor, refundAmount);
    }
}

```

---

## 🧪 2. The TypeScript Test Suite (`test/AutomatedEscrow.ts`)

We will use Hardhat Network Helpers to warp time and simulate the offchain network picking up the breach condition.

```typescript
import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther, decodeAbiParameters } from "viem";

describe("AutomatedEscrow Conditional Logic", function () {
  async function deployEscrowFixture() {
    const [owner, buyer] = await hre.viem.getWalletClients();
    const escrow = await hre.viem.deployContract("AutomatedEscrow");
    const publicClient = await hre.viem.getPublicClient();

    return { escrow, owner, buyer, publicClient };
  }

  it("Should return false for checkUpkeep before condition deadline passes", async function () {
    const { escrow, buyer } = await deployEscrowFixture();
    
    // Create an escrow that expires in 1 hour
    await escrow.write.createEscrow([buyer.account.address, 3600], { value: parseEther("1") });

    // Evaluate offchain view check
    const [upkeepNeeded] = await escrow.read.checkUpkeep(["0x"]);
    expect(upkeepNeeded).to.be.false;
  });

  it("Should flag checkUpkeep as true and successfully execute automated liquidation after timeout", async function () {
    const { escrow, buyer, publicClient } = await deployEscrowFixture();
    
    await escrow.write.createEscrow([buyer.account.address, 3600], { value: parseEther("5") });

    // Fast-forward EVM block clock time by 1 hour and 1 second
    await time.increase(3601);

    // 1. Off-chain Simulation step
    const [upkeepNeeded, performData] = await escrow.read.checkUpkeep(["0x"]);
    expect(upkeepNeeded).to.be.true;

    // Decode performance data payload to ensure it passes index 0
    const [decodedVaultId] = decodeAbiParameters([{ type: "uint256" }], performData);
    expect(decodedVaultId).to.equal(0n);

    // 2. On-chain Execution step (Simulating the Chainlink Node triggering the tx)
    const tx = await escrow.write.performUpkeep([performData]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

    expect(receipt.status).to.equal("success");
    
    const vaultResult = await escrow.read.vaults([0n]);
    expect(vaultResult[4]).to.be.true; // isSettled property updated
  });
});

```

*Run tests using:* `yarn hardhat test`

---

## 🚀 3. Deployment Specification (`ignition/modules/AutomatedEscrow.ts`)

```typescript
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const EscrowModule = buildModule("EscrowModule", (m) => {
  const escrow = m.contract("AutomatedEscrow");
  return { escrow };
});

export default EscrowModule;

```

---

## 💻 4. Client Interfacing and Monitoring Automation (`scripts/monitor.ts`)

This production script runs on an external client framework or backend service. It continuously monitors the contract via standard RPC queries, checking if parameters require execution intervention manually (fallback option if decentralized infrastructure is not used).

```typescript
import hre from "hardhat";
import { formatEther } from "viem";

async function monitorAndExecute() {
  const publicClient = await hre.viem.getPublicClient();
  const [executorWallet] = await hre.viem.getWalletClients();

  // Target coordinates deployed via local ignition network instance
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
  const escrow = await hre.viem.getContractAt("AutomatedEscrow", contractAddress);

  console.log("Starting condition checking monitor daemon loop...");

  // Execute evaluation query
  const [upkeepNeeded, performData] = await escrow.read.checkUpkeep(["0x"]);

  if (upkeepNeeded) {
    console.log(`🎯 Trigger condition matched! Execution required. Data payload: ${performData}`);
    
    // Broadcast fallback execution call transaction 
    const txHash = await escrow.write.performUpkeep([performData], {
      account: executorWallet.account
    });
    
    console.log(`Transaction submitted successfully! Waiting for block inclusion...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`🎉 Execution block confirmed! Gas Used: ${receipt.gasUsed.toString()}`);
  } else {
    console.log("⏳ Conditions not yet satisfied. Smart contract state optimal.");
  }
}

monitorAndExecute()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

```

### Steps to Run locally:

1. Start your local test network: `yarn hardhat node`
2. Deploy the architecture contract: `yarn hardhat ignition deploy ./ignition/modules/AutomatedEscrow.ts --network localhost`
3. Run the script checking loop criteria parameters: `yarn hardhat run ./scripts/monitor.ts --network localhost`