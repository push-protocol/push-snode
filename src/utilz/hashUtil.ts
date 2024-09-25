import * as CryptoJS from 'crypto-js'

export class HashUtil {
  // todo use a better lib
  public static sha256AsBytes(data: Uint8Array): Uint8Array {
    const wa = CryptoJS.lib.WordArray.create(data)
    const shaAsWordArray = CryptoJS.SHA256(wa)
    const hexString = CryptoJS.enc.Hex.stringify(shaAsWordArray)
    const shaAsArray = Uint8Array.from(Buffer.from(hexString, 'hex'))
    return shaAsArray
  }
}
