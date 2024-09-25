import { BitUtil } from './bitUtil'
import { HashUtil } from './hashUtil'

export class BlockUtil {
  public static calculateTransactionHashBase16(txRaw: Uint8Array): string {
    return BitUtil.bytesToBase16(HashUtil.sha256AsBytes(txRaw))
  }

  public static calculateBlockHashBase16(blockRaw: Uint8Array): string {
    return BitUtil.bytesToBase16(HashUtil.sha256AsBytes(blockRaw))
  }
}
