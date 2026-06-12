import hre from 'hardhat'

const monitorAndExecute = async () => {
  const { viem } = await hre.network.create()
  const publicClient = await viem.getPublicClient()
  const [executorWallet] = await viem.getWalletClients()

  // Target coordinates deployed via local ignition network instance
  const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
  const escrow = await viem.getContractAt('AutomatedEscrow', contractAddress)

  console.log('Starting condition checking monitor daemon loop ...')

  // Execute evaluation query
  const [upkeepNeeded, performData] = await escrow.read.checkUpkeep(['0x'])

  if (upkeepNeeded) {
    console.log(
      `🎯 Trigger condition matched! Execution required. Data payload: ${performData}`,
    )

    // Broadcast fallback execution call transaction
    const txHash = await escrow.write.performUpkeep([performData], {
      account: executorWallet.account,
    })

    console.log(
      `Transaction submitted successfully! Waiting for block inclusion ...`,
    )
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })
    console.log(
      `🎉 Exexution block confirmed! Gas Used: ${receipt.gasUsed.toString()}`,
    )
  } else {
    console.log(
      `⏳ Conditions not yet satisfied. Smart contract state optimal.`,
    )
  }
}

monitorAndExecute()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
