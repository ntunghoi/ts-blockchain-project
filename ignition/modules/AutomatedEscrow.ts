import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const EscrowModule = buildModule('EscrowModule', (m) => {
  const escrow = m.contract('AutomatedEscrow')
  return { escrow: escrow }
})

export default EscrowModule
