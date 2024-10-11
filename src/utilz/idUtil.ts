import * as uuid from 'uuid'

export default class IdUtil {
  public static getUuidV4(): string {
    return uuid.v4()
  }

  public static getUuidV4AsBytes(): Uint8Array {
    return uuid.parse(uuid.v4())
  }
}
