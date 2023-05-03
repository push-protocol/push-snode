import crypto from "crypto";
import {Wallet} from "ethers";
import {task} from "hardhat/config";

let info = console.log;

task("key:generateTestEthKeys", "shows a pre defined set of keys used for tests")
    .setAction(async (taskArgs, hre) => {
        await printPrivateKeyDetails('0x33fb23f822c5dba0f3cb2796b90d56bb553ebd215726398c93374440b34e510b', 'test');
        await printPrivateKeyDetails('0x16c90855a0dfc9884adf2625a4bffcdbfe760d5ff6756a766d2bbc0bc82318f0', 'test');
        await printPrivateKeyDetails('0xb6c538bac86eb0964b16b7ff6a1ac7d5f0736dcbd0f00bd142ae433dad27f685', 'test');
        await printPrivateKeyDetails('0x445ab25af345ce4096ca1e46f6846a4e8617cc1d513440671647f5f137c9c684', 'test');
    });

task("key:generateEthKeyFromEthers", "generates secure keys")
    .addPositionalParam("passwordForJsonKeyFile")
    .setAction(async (args, hre) => {
        const wallet = hre.ethers.Wallet.createRandom();
        const privKey = wallet.privateKey;
        const address = wallet.address;
        info(`generated address=${address}, privKey=${privKey}`);
        await printPrivateKeyDetails(privKey, args.passwordForJsonKeyFile);
    });

task("key:generateEthKeyFromRandom", "generates secure keys")
    .addPositionalParam("passwordForJsonKeyFile")
    .setAction(async (args, hre) => {
        const privKey = generateRandomEthPrivateKey();
        info(`generated privKey=${privKey}`);
        await printPrivateKeyDetails(privKey, args.passwordForJsonKeyFile);
    });


function generateRandomEthPrivateKey() {
    return "0x" + crypto.randomBytes(32).toString("hex");
}

async function generateKeys() {

}

async function printPrivateKeyDetails(privKey: string, pass: string) {
    const wallet1 = new Wallet(privKey);
    const wallet1Address = await wallet1.getAddress();
    const encryptedJsonWallet = await wallet1.encrypt(pass);

    info("-".repeat(20));
    info("address ", wallet1Address);
    info("privKey", privKey);
    info("pubKey", wallet1.publicKey);
    info("encrypted json pass:", pass);
    info("encrypted json:", encryptedJsonWallet);
    info("=".repeat(20));
}