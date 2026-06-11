import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'
import { parseEther } from 'viem'

const CrowdFundModule = buildModule('CrowdFundModule', (m) => {
  const targetGoal = m.getParameter('targetGoal', parseEther('5').toString())
  const duration = m.getParameter('duration', 3600)

  const crowdfund = m.contract('Crowdfund', [targetGoal, duration])

  return { crowdfund }
})

export default CrowdFundModule
