const {ethers,upgrades} = require("hardhat");

async function main(){

    const Dstorage1 = await ethers.getContractFactory("DStorageV1");
    console.log("Deploying Dstorage1...");
    const dstorage1 = await upgrades.deployProxy(Dstorage1,[],{
        initializer: "initialize"
    });
    await dstorage1.deployed();
    console.log("Dstorage1 deployed to:",dstorage1.address);

}

main();


// Contract Deployment Details : 
// DStorage Contract : 0x03748C1A169E99A35914a91A629d33222f0a899E
// Proxy Contract :  0x8F4e5f8D379f92c4e959cf8E6aDECb8BE2BF0Abe