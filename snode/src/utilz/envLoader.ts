import dotenv from 'dotenv'
import StrUtil from './strUtil'

export class EnvLoader {

  public static loadEnvOrFail() {
    // loads all .env variables into process.env.* variables
    // Optional support for CONFIG_DIR variable
    console.log(`config dir is ${process.env.CONFIG_DIR}`);
    let options = {};
    if (process.env.CONFIG_DIR) {
      options = {path: `${process.env.CONFIG_DIR}/.env`};
    }
    const envFound = dotenv.config(options);
    if (envFound.error) {
      throw new Error("⚠️  Couldn't find .env file  ⚠️")
    }
  }

  public static getPropertyOrFail(propName: string): string {
    const val = process.env[propName]
    if (StrUtil.isEmpty(val)) {
      throw new Error(`process.env.${propName} is empty`)
    }
    return val
  }

  // for undefined: defaults to false
  public static getPropertyAsBool(propName: string): boolean {
    const val = process.env[propName]
    return val != null && val.toLowerCase() === 'true'
  }

  public static getPropertyOrDefault(propName: string, def:string): string {
    const val = process.env[propName]
    if (StrUtil.isEmpty(val)) {
      return def;
    }
    return val
  }
}
