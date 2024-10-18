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
    const query = `SELECT object_hash FROM blocks WHERE object_hash = ANY($1::text[])`
    const result = await PgUtil.queryArr<{ id: number; object: string; object_hash: string }>(
      query,
      [blockHashes]
    )
    console.log('result:', result)
    const foundHashes = result.map((row) => row.object_hash)

    const statusArray = blockHashes.map((hash) =>
      foundHashes.includes(hash) ? 'SEND' : 'NOT_SEND'
    )
    return { result: statusArray }
  }
}
