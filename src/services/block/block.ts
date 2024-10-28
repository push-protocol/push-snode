import { Service } from 'typedi'

import { BitUtil } from '../../utilz/bitUtil'
import { PgUtil } from '../../utilz/pgUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'

// noinspection UnnecessaryLocalVariableJS
@Service()
export class Block {
  private static log = WinstonUtil.newLog(Block)

  static async getBlockByHash(blockHash: string) {
    const query = `SELECT * FROM blocks WHERE block_hash = $1`
    const result = await PgUtil.queryOneRow(query, [blockHash])
    return { result: result }
  }

  /**
   *
   * @param blockHashes hashes to check against this node storage,
   * accepts:
   * '0xAA', '0xaa', 'aa', 'AA' byte encodings
   *
   * replies ['DO_NOT_SEND', 'SEND']
   * SEND = A VNode is forced to submit data
   * DO_NOT_SENT = thanks, but we already have this block, don't submit the data
   */
  static async getBulkBlocksByHash(blockHashes: string[]): Promise<String[]> {
    Block.log.debug('getBulkBlocksByHash() call: %s', blockHashes)
    for (let i = 0; i < blockHashes.length; i++) {
      blockHashes[i] = BitUtil.hex0xRemove(blockHashes[i]).toLowerCase()
    }
    // db stores everything in lowercase base16
    const result = await PgUtil.queryArr<{ object_hash: string }>(
      `SELECT object_hash FROM blocks WHERE object_hash = ANY($1::text[])`,
      [blockHashes]
    )
    const foundHashes = new Set<string>(result.map((row) => row.object_hash))

    const statusArray = blockHashes.map((hash) => (foundHashes.has(hash) ? 'DO_NOT_SEND' : 'SEND'))
    Block.log.debug('getBulkBlocksByHash() result: %s', statusArray)
    return statusArray
  }
}
