import path from "path";
import fs from "fs";

export class EthersUtil {
  public static loadAbi(configDir: string, fileNameInConfigDir: string): string {
    const fileAbsolute = path.resolve(configDir, `./${fileNameInConfigDir}`);
    const file = fs.readFileSync(fileAbsolute, 'utf8');
    const json = JSON.parse(file);
    const abi = json.abi;
    console.log(`abi size:`, abi.length);
    return abi;
  }
}