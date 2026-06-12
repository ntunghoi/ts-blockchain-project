import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const YieldVaultModule = buildModule('YieldVaultModule', (m) => {
  // First deploy the asset contract dependency
  const token = m.contract('MockUSDC')

  // Secondary deployment passing asset contract coordinates as variable arguments
  const vault = m.contract('YieldVault', [token, 'Yield Beaing USDC', 'yUSDC'])

  return { token, vault }
})

export default YieldVaultModule
