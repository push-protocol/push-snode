import {Service} from "typedi";
import {WinstonUtil} from "../../utilz/winstonUtil";
import {Logger} from "winston";
import {Consumer, QItem} from "../messaging-dset/queueTypes";
import {MySqlUtil} from "../../utilz/mySqlUtil";
import {MessageBlock, MessageBlockUtil} from "../messaging-common/messageBlock";
import {ObjectHasher} from "../../utilz/objectHasher";

@Service()
export class BlockStorage {
  public log: Logger = WinstonUtil.newLog(BlockStorage);


  async saveBlockWithShardData(mb: MessageBlock, calculatedHash: string, shardSet: Set<number>): Promise<boolean> {
    // NOTE: the code already atomically updates the db ,
    //  so let's drop select because it's excessive)
    let hashFromDb = await MySqlUtil.queryOneValueOrDefault(
      'SELECT object_hash FROM blocks where object_hash=?',
      null, calculatedHash);
    if (hashFromDb != null) {
      this.log.info('received block with hash %s, ' +
        'already exists in the storage at index %d, ignoring',
        calculatedHash, hashFromDb);
      return false;
    }
    // insert block
    this.log.info('received block with hash %s, adding to the db', calculatedHash);
    const objectAsJson = JSON.stringify(mb);
    const res = await MySqlUtil.insert(
      `INSERT
      IGNORE INTO blocks(object, object_hash) VALUES (?, ?)`,
      objectAsJson, calculatedHash);
    let requiresProcessing = res.affectedRows === 1;
    if (!requiresProcessing) {
      return false;
    }
    // insert block to shard mapping
    let valuesStr = '';
    let valuesArr = [];
    for (const shardId of shardSet) {
      valuesArr.push(calculatedHash, shardId);
      valuesStr += valuesStr.length == 0 ? '(? , ?)' : ',(? , ?)'
    }
    const res2 = await MySqlUtil.insert(
      `INSERT
      IGNORE INTO dset_queue_mblock(object_hash, object_shard) VALUES
      ${valuesStr}`,
      ...valuesArr);
    return true;
  }


}
