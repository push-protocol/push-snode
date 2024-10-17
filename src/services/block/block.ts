import { Service } from 'typedi'

import { PgUtil } from '../../utilz/pgUtil'

@Service()
export class Block {
  constructor() {}

  static async getBlockByHash(blockHash: string) {
    const query = `SELECT * FROM blocks WHERE block_hash = $1`
    const result = await PgUtil.queryOneRow(query, [blockHash])
    return { result: result }
  }

  static async getBulkBlocksByHash(blockHashes: string[]) {
    const query = `SELECT block_hash FROM blocks WHERE block_hash = ANY($1)`
    const result = await PgUtil.queryArr(query, [blockHashes])
    const foundHashes = result.map((row: { block_hash: string }) => row.block_hash)
    const statusArray = blockHashes.map((hash) =>
      foundHashes.includes(hash) ? 'SEND' : 'NOT_SEND'
    )

    return { result: statusArray }
  }
}
