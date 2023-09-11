import {Inject, Service} from 'typedi'
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
import {StorageContractState} from "../messaging-common/storageContractState";


@Service()
export default class StorageNode implements Consumer<QItem> {
  public log: Logger = WinstonUtil.newLog(StorageNode)

  @Inject()
  private valContractState: ValidatorContractState;

  @Inject()
  private storageContractState: StorageContractState;

  @Inject(type => QueueManager)
  private queueManager: QueueManager;

  @Inject()
  private blockStorage: BlockStorage;

  private client: QueueClient;

  public async postConstruct() {
    // MySqlUtil.init(dbHelper.pool); todo postgres !!!!!!!!!!!!!!
    await this.valContractState.postConstruct();
    await this.storageContractState.postConstruct();
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
    let activeValidators = CollectionUtil.arrayToFields(this.valContractState.getActiveValidators(), 'nodeId');
    let check1 = MessageBlockUtil.checkBlock(mb, activeValidators);
    if (!check1.success) {
      this.log.error('item validation failed: ', check1.err);
      return false;
    }
    // check database
    let shardSet = MessageBlockUtil.calculateAffectedShards(mb);
    let isNew = await this.blockStorage.saveBlockWithShardData(mb, calculatedHash, shardSet);
    if (!isNew) {
      // this is not an error, because we read duplicates from every validator
      this.log.debug('block %s already exists ', mb.id);
      return false;
    }
    // send block
    await this.unpackBlockToInboxes(mb, shardSet);
  }

  // todo see DbHelper checkThatShardIsOnThisNode
  public getNodeShards(): Set<number> {
    let set = new Set<number>();
    for (let i = 0; i < 128; i++) {
      set.add(i);
    }
    return set;
  }

  // sends the block contents (internal messages from every response)
  // to every recipient's inbox
  public async unpackBlockToInboxes(mb: MessageBlock, shardSet: Set<number>) {
    // this is the list of shards that we support on this node
    const nodeShards = this.getNodeShards();
    this.log.debug('storage node supports %s shards: %o', nodeShards.size, nodeShards);
    let shardsToProcess = CollectionUtil.intersectSets(shardSet, nodeShards);
    this.log.debug('block %s has %d inboxes to unpack', mb.id, shardsToProcess)
    if (shardsToProcess.size == 0) {
      this.log.debug('finished');
      return;
    }
    let nowStr = DateUtil.currentTimeSeconds() + '';
    const currentNodeId = this.valContractState.nodeId;
    for (let i = 0; i < mb.responses.length; i++) {
      const feedItem = mb.responses[i];
      const targetWallets: string[] = MessageBlockUtil.calculateRecipients(mb, i);
      for (let i1 = 0; i1 < targetWallets.length; i1++) {
        const targetAddr = targetWallets[i1];
        const targetShard = MessageBlockUtil.calculateAffectedShard(targetAddr);
        if (!shardsToProcess.has(targetShard)) {
          continue;
        }
        await this.putToInbox('inbox', targetAddr, nowStr, currentNodeId, feedItem.payload);
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
  public async putToInbox(nsName: string, nsIndex: string,
                          ts: string,
                          nodeId: string,
                          fpayload: FPayload) {
    const key = fpayload.data.sid;
    fpayload.recipients = null; // null recipients field because we don't need that
    this.log.debug(`nsName=${nsName} nsIndex=${nsIndex} ts=${ts} key=${key} nodeId=${nodeId} fpayload=${fpayload}`);
    let shardId = DbHelper.calculateShardForNamespaceIndex(nsName, nsIndex);
    this.log.debug(`nodeId=${nodeId} shardId=${shardId}`);
    const success = await DbHelper.checkThatShardIsOnThisNode(nsName, shardId, nodeId);// todo REMOVE !!!!!!!!!!
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
    const storageValue = await DbHelper.putValueInTable(nsName, shardId, nsIndex, storageTable,
      ts, key, JSON.stringify(fpayload));
    this.log.debug(`found value: ${storageValue}`)
    this.log.debug('success is ' + success);
  }
}