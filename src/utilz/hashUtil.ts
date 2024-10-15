import crypto from 'crypto'
import * as CryptoJS from 'crypto-js'

// todo use a better lib
export class HashUtil {
  // for readability
  private static arrayToWordArray(data: Uint8Array) {
    return CryptoJS.lib.WordArray.create(data)
  }

  // for readability
  private static wordArrayToArray(shaAsWordArray: CryptoJS.lib.WordArray) {
    const hexString = CryptoJS.enc.Hex.stringify(shaAsWordArray)
    const shaAsArray = Uint8Array.from(Buffer.from(hexString, 'hex'))
    return shaAsArray
  }

  public static sha256AsBytes(data: Uint8Array): Uint8Array {
    const wa = HashUtil.arrayToWordArray(data)
    const shaAsWordArray = CryptoJS.SHA256(wa)
    return HashUtil.wordArrayToArray(shaAsWordArray)
  }

  public static sha256ArrayAsBytes(data: Uint8Array[]): Uint8Array {
    const sha256 = CryptoJS.algo.SHA256.create()
    for (const chunk of data) {
      const wa = HashUtil.arrayToWordArray(chunk)
      sha256.update(wa)
    }
    const shaAsWordArray = sha256.finalize()
    return HashUtil.wordArrayToArray(shaAsWordArray)
  }

  // todo compare this hash with crypto-js
  public static sha512ArrayAsBytes(data: Uint8Array[]): Uint8Array {
    const hasher = crypto.createHash('sha512')
    for (const arr of data) {
      hasher.update(arr)
    }
    const hash = hasher.digest()
    return new Uint8Array(hash)
  }

  // todo compare this hash with crypto-js
  public static sha256AsBytesEx(data: Uint8Array): Uint8Array {
    const hasher = crypto.createHash('sha256')
    hasher.update(data)
    const hash = hasher.digest()
    return new Uint8Array(hash)
  }
}
