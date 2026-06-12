import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import hre from 'hardhat'
import { parseUnits } from 'viem'

describe('YieldVault Protocol', () => {
  const deployVaultFixture = async () => {
    const { viem } = await hre.network.create()
    const [owner, alice, bob] = await viem.getWalletClients()

    // Deploy underlying mock asset (6 Decimals like standard USDC)
    const mockUSDC = await viem.deployContract('MockUSDC')

    // Deploy Vault
    const yieldVault = await viem.deployContract('YieldVault', [
      mockUSDC.address,
      'Yield Bearing USDC',
      'yUSDC',
    ])

    // Distribute testing funds to Alice and Bob
    const initialUserBalance = parseUnits('1000', 6) // 1,000 mUSDC
    await mockUSDC.write.mint([alice.account.address, initialUserBalance])
    await mockUSDC.write.mint([bob.account.address, initialUserBalance])

    return {
      viem: viem,
      mockUSDC: mockUSDC,
      yieldVault: yieldVault,
      owner: owner,
      alice: alice,
      bob: bob,
    }
  }

  describe('Vault Mechanics & Math Calculations', () => {
    it('Should track track shifting share values as external yield accumulates', async () => {
      const { viem, mockUSDC, yieldVault, alice, bob } =
        await deployVaultFixture()

      const depositAmount = parseUnits('100', 6)

      // Connect Alic to both tokens
      const usdcAsAlice = await viem.getContractAt(
        'MockUSDC',
        mockUSDC.address,
        { client: { wallet: alice } },
      )
      const vaultAsAlice = await viem.getContractAt(
        'YieldVault',
        yieldVault.address,
        { client: { wallet: alice } },
      )

      // Alice Approves and Deposits 100 USDC
      await usdcAsAlice.write.approve([yieldVault.address, depositAmount])
      await vaultAsAlice.write.deposit([depositAmount, alice.account.address])
      
      // Since Alice is the first depositor, her shares should equal her deposited assets roughly 1:1
      const aliceShares = await yieldVault.read.balanceOf([
        alice.account.address,
      ])
      assert.ok(aliceShares > 0n)

      // --- Yield Accrual Simulation ---
      // The protocol owner deposits 50 USDC directly to simulate harvesting external system yields
      const yieldAmount = parseUnits('50', 6)
      await mockUSDC.write.approve([yieldVault.address, yieldAmount])
      await yieldVault.write.simulateYieldProduction([yieldAmount])

      // Connect Bob to both tokens
      const usdcAsBob = await viem.getContractAt('MockUSDC', mockUSDC.address, {
        client: { wallet: bob },
      })
      const vaultAsBob = await viem.getContractAt(
        'YieldVault',
        yieldVault.address,
        { client: { wallet: bob } },
      )

      // Bob deposits the identical asset size: 100 USDC
      await usdcAsBob.write.approve([yieldVault.address, depositAmount])
      await vaultAsBob.write.deposit([depositAmount, bob.account.address])

      // CRITICAL EVALUATION: Because yield accumulated before Bob deposited,
      // his 100 USDC yields FEWER shares than Alice received for her 100 USDC.
      const bobShares = await yieldVault.read.balanceOf([bob.account.address])
      assert.ok(
        bobShares < aliceShares,
        "Bob's 100 USDC yields fewer shares than Alice receiverd for her 100 USDC",
      )
    })
  })
})
