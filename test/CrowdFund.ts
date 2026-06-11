import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import hre from 'hardhat'
import { parseEther, getAddress } from 'viem'
import { crossfi } from 'viem/chains'

describe('CrowdFund Contract', () => {
  // A resuable fixture to set up state before each test scenario
  const deployCrowdfundFixture = async () => {
    const { viem, networkHelpers } = await hre.network.create()
    const [owner, contributor1, contributor2] = await viem.getWalletClients()

    const targetGoal = parseEther('10')
    const duration = 3600

    const crowdfund = await viem.deployContract('Crowdfund', [
      targetGoal,
      duration,
    ])

    const publicClient = await viem.getPublicClient()

    return {
      viem: viem,
      networkHelpers: networkHelpers,
      crowdfund: crowdfund,
      targetGoal: targetGoal,
      duration: duration,
      owner: owner,
      contributor1: contributor1,
      contributor2: contributor2,
      publicClient: publicClient,
    }
  }

  describe('Deployment', () => {
    it('Should set the correct variables upon initialization', async () => {
      const { crowdfund, owner, targetGoal } = await deployCrowdfundFixture()

      assert.equal(
        getAddress(owner.account.address),
        await crowdfund.read.creator(),
      )
      assert.equal(targetGoal, await crowdfund.read.targetGoal())
      assert.equal(false, await crowdfund.read.fundsWithdrawn())
    })
  })

  describe('Contributions', () => {
    it('Should accept contributions and update contract state', async () => {
      const { viem, crowdfund, contributor1 } = await deployCrowdfundFixture()
      const contributionAmount = parseEther('2')

      const crowdfundAsContributor = await viem.getContractAt(
        'Crowdfund',
        crowdfund.address,
        { client: { wallet: contributor1 } },
      )

      await crowdfundAsContributor.write.contribute({
        value: contributionAmount,
      })

      assert.equal(contributionAmount, await crowdfund.read.totalRaised())

      assert.equal(
        contributionAmount,
        await crowdfund.read.contributions([contributor1.account.address]),
      )
    })

    it('Should revert if an account contributes 0 value', async () => {
      const { viem, crowdfund, contributor1 } = await deployCrowdfundFixture()

      const crowdfundAsContributor = await viem.getContractAt(
        'Crowdfund',
        crowdfund.address,
        { client: { wallet: contributor1 } },
      )

      viem.assertions.revertWithCustomError(
        crowdfundAsContributor.write.contribute({ value: 0n }),
        crowdfund,
        'ZeroContribution',
      )
    })
  })

  describe('Withdrawals & Refund (Time Dependent Steps', () => {
    it('Should allow the creator to widthdraw if target goal is met', async () => {
      const { viem, networkHelpers, crowdfund, owner, contributor1, duration } =
        await deployCrowdfundFixture()

      const crowdfundContributor = await viem.getContractAt(
        'Crowdfund',
        crowdfund.address,
        { client: { wallet: contributor1 } },
      )

      await crowdfundContributor.write.contribute({ value: parseEther('10') })

      await networkHelpers.time.increase(duration + 1)

      const crowdfundAsOwner = await viem.getContractAt(
        'Crowdfund',
        crowdfund.address,
        { client: { wallet: owner } },
      )

      await assert.doesNotReject(crowdfundAsOwner.write.withdrawFunds())
      assert.equal(true, await crowdfund.read.fundsWithdrawn())
    })
  })

  describe('Should allow users to pull refunds if campaign deadline passes and fails goal', async () => {
    const { viem, networkHelpers, crowdfund, contributor1, duration } =
      await deployCrowdfundFixture()

    const crowFundAsContributor = await viem.getContractAt(
      'Crowdfund',
      crowdfund.address,
      { client: { wallet: contributor1 } },
    )

    // Only contribute partial amount
    await crowFundAsContributor.write.contribute({ value: parseEther('3') })

    await networkHelpers.time.increase(duration + 1)

    await assert.doesNotReject(crowFundAsContributor.write.claimRefund())
    assert.equal(
      0n,
      await crowdfund.read.contributions([contributor1.account.address]),
    )
  })
})
