# Validator contract

# How to run tests (uses embedded EVM, it resets for every test case)
```shell
npx hardhat test
```

# How to set up the local env

## Run an empty local hardhat EVM as a DEDICATED SEPARATE PROCESS
```shell
export PRIVATE_KEY=[YOUR KEY]
npx hardhat node
```

## Deploy Push contract and validator contract

```shell
npx hardhat run --network localhost scripts/deploy.ts

# read the output and export contract addresses


export PUSH_ADDRESS=[PUSH_CONTRACT_ADDRESS]
export VALIDATOR_ADDRESS=[VALIDATOR_CONTRACT_ADDRESS]
```

## Register 3 local test nodes (see the script for details)

```shell
npx hardhat run --network localhost scripts/registerTestNodes.ts
```
