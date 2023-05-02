# Validator contract

## 1 How to run tests (uses embedded EVM, it resets for every test case)
```shell
npx hardhat test
```

## 2 How to set up the local env

Run an empty local hardhat EVM as a DEDICATED SEPARATE PROCESS
```shell
export PRIVATE_KEY=[YOUR KEY]
npx hardhat node
```

Deploy Push contract and validator contract

```shell
# compile everything
npx hardhat compile
# deploy a test PUSH token an put the result address into a variable
npx hardhat --network localhost v:deployTestPushTokenCt
export PUSH_CT=0x5FbDB2315678afecb367f032d93F642f64180aa3 // example address
# deploy Validator and puth the result (proxy) address into a variable
npx hardhat --network localhost v:deployValidatorCt $PUSH_CT
export VAL_CT=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 // example address

# for contract updates only (using proxy!)
npx hardhat --network localhost v:updateValidatorCt $VAL_CT

# to register 3 validator nodes
npx hardhat --network localhost v:registerValidator --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT 8e12de12c35eabf35b56b04e53c4e468e46727e8 "http://localhost:4001" 101
npx hardhat --network localhost v:registerValidator --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT fdaeaf7afcfbb4e4d16dc66bd2039fd6004cfce8 "http://localhost:4002" 102
npx hardhat --network localhost v:registerValidator --validator-proxy-ct $VAL_CT --push-ct $PUSH_CT 98f9d910aef9b3b9a45137af1ca7675ed90a5355 "http://localhost:4003" 103

```
