# Environment Setup

```bash
# yarn setup
yarn init
yarn config set nodeLinker node-modules
yarn install

# hardhat setup
yarn add --dev hardhat
yarn hardhat --init

# hardhat startup
yarn hardhat node

# contract compile
yarn hardhat compile

# contract deploy
yarn hardhat ignition deploy ./ignition/modules/CrowdFund.ts --network localhost
```
