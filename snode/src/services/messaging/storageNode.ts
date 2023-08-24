import {Service, Container, Inject} from 'typedi'
import config from '../../config'
import StrUtil from "../../utilz/strUtil";
import {ValidatorContractState} from "../messaging-common/validatorContractState";
import {Logger} from "winston";
import {FPayload, MessageBlock, MessageBlockUtil} from "../messaging-common/messageBlock";
import {QueueClient} from "../messaging-dset/queueClient";
import {Consumer, QItem} from "../messaging-dset/queueTypes";
import {BlockStorage} from "./BlockStorage";
import {QueueManager} from "./queueManager";
import {CollectionUtil} from "../../utilz/collectionUtil";
import {Check} from "../../utilz/check";
import {WinstonUtil} from "../../utilz/winstonUtil";
import DateUtil from "../../utilz/dateUtil";
import DbHelper from "../../helpers/dbHelper";


@Service()
export default class StorageNode implements Consumer<QItem> {
  public log: Logger = WinstonUtil.newLog(StorageNode)

  @Inject()
  private contract: ValidatorContractState;

  @Inject(type => QueueManager)
  private queueManager: QueueManager;

  @Inject()
  private blockStorage: BlockStorage;

  private client: QueueClient;

  public async postConstruct() {
    // MySqlUtil.init(dbHelper.pool); todo postgres !!!!!!!!!!!!!!
    await this.contract.postConstruct();
    await this.queueManager.postConstruct();
  }

  // remote queue handler
  async accept(item: QItem): Promise<boolean> {
    // check hash
    let mb = <MessageBlock>item.object;
    Check.notEmpty(mb.id, 'message block has no id');
    let calculatedHash = MessageBlockUtil.calculateHash(mb);
    if (calculatedHash !== item.object_hash) {
      this.log.error('received item hash=%s , ' +
        'which differs from calculatedHash=%s, ' +
        'ignoring the block because producer calculated the hash incorrectly',
        item.object_hash, calculatedHash);
      return false;
    }
    // check contents
    // since this check is not for historical data, but for realtime data,
    // so we do not care about old blocked validators which might occur in the historical queue
    let activeValidators = CollectionUtil.arrayToFields(this.contract.getActiveValidators(), 'nodeId');
    let check1 = MessageBlockUtil.checkBlock(mb, activeValidators);
    if (!check1.success) {
      this.log.error('item validation failed: ', check1.err);
      return false;
    }
    // check database
    let isNew = await this.blockStorage.accept(item);
    if(!isNew) {
      // this is not an error, because we read duplicates from every validator
      this.log.debug('block %s already exists ', mb.id);
      return false;
    }
    // send block
    await this.unpackBlock(mb);
  }

  // sends the block contents (internal messages from every response)
  // to every recipient's inbox
  public async unpackBlock(mb: MessageBlock) {
    // todo calculate shard


    let now = Date.now() / 1000;
    let nowStr = now + '';
    const currentNodeId = this.contract.nodeId;
    for (const feedItem of mb.responses) {
      let targetWallets = feedItem.header.recipients;
      for (const targetWallet of targetWallets) {
        await this.putToInbox('inbox', targetWallet, nowStr, currentNodeId, feedItem.payload);
      }
    }
  }

  /**
   *
   * @param nsName ex: inbox
   * @param nsIndex ex: eip155:0xAAAAA
   * @param ts current time, ex: 1661214142.123456
   * @param nodeId current node id, ex: 0xAAAAAAA
   * @param fpayload payload format
   */
  public async putToInbox(nsName:string, nsIndex:string,
                          ts:string,
                          nodeId:string,
                          fpayload:FPayload) {
    const key = fpayload.data.sid;
    fpayload.recipients = null; // null recipients field because we don't need that
    this.log.debug(`nsName=${nsName} nsIndex=${nsIndex} ts=${ts} key=${key} nodeId=${nodeId} fpayload=${fpayload}`);
    let shardId = DbHelper.calculateShardForNamespaceIndex(nsName, nsIndex);
    this.log.debug(`nodeId=${nodeId} shardId=${shardId}`);
    const success = await DbHelper.checkThatShardIsOnThisNode(nsName, shardId, nodeId);
    if (!success) {
      let errMsg = `${nsName}.${nsIndex} maps to shard ${shardId} which is missing on node ${nodeId}`;
      console.log(errMsg);
    }
    const date = DateUtil.parseUnixFloatAsDateTime(ts);
    this.log.debug(`parsed date ${ts} -> ${date}`)
    var storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
    this.log.debug(`found table ${storageTable}`)
    if (StrUtil.isEmpty(storageTable)) {
      this.log.error('storage table not found');
      var monthStart = date.startOf('month').toISODate().toString();
      var monthEndExclusive = date.startOf('month').plus({months: 1}).toISODate().toString();
      this.log.debug('creating new storage table');
      const dateYYYYMM = DateUtil.formatYYYYMM(date);
      const tableName = `storage_ns_${nsName}_d_${dateYYYYMM}`;
      const recordCreated = await DbHelper.createNewNodestorageRecord(nsName, shardId,
        monthStart, monthEndExclusive, tableName);
      if (recordCreated) {
        this.log.debug('record created: ', recordCreated)
        // we've added a new record to node_storage_layout => we can safely try to create a table
        // otherwise, if many connections attempt to create a table from multiple threads
        // it leads to postgres deadlock sometimes
        const createtable = await DbHelper.createNewStorageTable(tableName);
        this.log.debug('creating node storage layout mapping')
        this.log.debug(createtable);
      }
    }
    var storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
    const storageValue = await DbHelper.putValueInTable(nsName, shardId, nsIndex, storageTable,
      ts, key, JSON.stringify(fpayload));
    this.log.debug(`found value: ${storageValue}`)
    this.log.debug('success is ' + success);
  }
}