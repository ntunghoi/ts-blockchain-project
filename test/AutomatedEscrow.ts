import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import hre from 'hardhat'
import { decodeAbiParameters, parseEther } from 'viem'

describe('AutomatedEscrow Conditional Logic', () => {
  const deployEscrowFixture = async () => {
    const { viem, networkHelpers } = await hre.network.create()
    const [owner, buyer] = await viem.getWalletClients()
    const escrow = await viem.deployContract('AutomatedEscrow')
    const publicClient = await viem.getPublicClient()

    return {
      viem: viem,
      networkHelpers: networkHelpers,
      escrow: escrow,
      owner: owner,
      buyer: buyer,
      publicClient: publicClient,
    }
  }

  it('Should return false for checkUpkeep before condition deadline passes', async () => {
    const { escrow, buyer } = await deployEscrowFixture()

    // Create an escrow that expires in 1 hour
    await escrow.write.createEscrow([buyer.account.address, 3600], {
      value: parseEther('1'),
    })

    // Evaluate offchain view check
    const [upkeepNeeded] = await escrow.read.checkUpkeep(['0x'])
    assert.ok(!upkeepNeeded)
  })

  it('Should flat checkUpkeep as true and successfiully execute automated liquidation after timeout', async () => {
    const { networkHelpers, escrow, buyer, publicClient } =
      await deployEscrowFixture()

    // Create an escrow that expires in 1 hour
    const duration = 60 * 60
    await escrow.write.createEscrow([buyer.account.address, duration], {
      value: parseEther('1'),
    })
    await networkHelpers.time.increase(duration + 1)

    // 1. Off-chain Simulation step
    const [upkeepNeeded, performData] = await escrow.read.checkUpkeep(['0x'])
    assert.ok(upkeepNeeded)

    // Decode performance data payload to enusre it passes index 0
    const [decodeVaultId] = decodeAbiParameters(
      [{ type: 'uint256' }],
      performData,
    )
    assert.equal(decodeVaultId, 0n)

    // 2. On-chain Execution step (Simulating the Chainlink Node triggering the tx)
    const tx = await escrow.write.performUpkeep([performData])
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })

    assert.equal(receipt.status, 'success')

    const vaultResult = await escrow.read.vaults([0n])
    assert.ok(vaultResult[4]) // isSettled property updated
  })
})
