import hre from 'hardhat'
import { formatUnits, parseUnits } from 'viem'

const main = async () => {
  const { viem } = await hre.network.create()
  const [deployer] = await viem.getWalletClients()
  const publicClient = await viem.getPublicClient()

  console.log(
    `Interacting with contracts via account: ${deployer.account.address}`,
  )

  // 1. Get references to your locally active contracts
  // (In real production environment, pass specific network hax addresses instead)
  const token = await viem.getContractAt(
    'MockUSDC',
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  )
  const vault = await viem.getContractAt(
    'YieldVault',
    '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  )

  // 2. Query initial System State Parameters
  const initialAssets = await vault.read.totalAssets()
  const initialSupply = await vault.read.totalSupply()
  console.log(
    `Vault Status: Total Assets = ${formatUnits(initialAssets, 6)}, Total Shares = ${formatUnits(initialSupply, 18)}`,
  )

  // 3. Perform a Deposit Routine Execution
  const amountToDeposit = parseUnits("200", 6)

  console.log("Approving Vault spending access...")
  const txApprove = await token.write.approve([vault.address, amountToDeposit])
  await publicClient.waitForTransactionReceipt({hash: txApprove})

  console.log("Executing Deposit process ...")
  const txDeposit = await vault.write.deposit([amountToDeposit, deployer.account.address])
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txDeposit})

  console.log(`Deposit completed successfully inside Transaction Hash: ${receipt.transactionHash}`)

  // 4. Query End Balance Updates
  const currentShares = await vault.read.balanceOf([deployer.account.address])
  console.log(`Your account Vault share balance token position size: ${formatUnits(currentShares, 6)} shares`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
