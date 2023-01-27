import { ethers } from "hardhat";

async function main() {

  require("dotenv").config();

  const TokenAddress = process.env.TOKEN_ADDRESS;
  const DStorageV1 = await ethers.getContractFactory("DStorageV1");
  const dstoragev1 = await DStorageV1.deploy(TokenAddress || "0x0");

  await dstoragev1.deployed();

  console.log(`DStorageV1 contract is deployed to ${dstoragev1.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
