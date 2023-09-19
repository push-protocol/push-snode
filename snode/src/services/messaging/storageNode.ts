import {Inject, Service} from 'typedi'
import {ValidatorContractState} from "../messaging-common/validatorContractState";
import {Logger} from "winston";
import {FPayload, MessageBlock, MessageBlockUtil} from "../messaging-common/messageBlock";
import {QueueClient} from "../messaging-dset/queueClient";
import {Consumer, QItem} from "../messaging-dset/queueTypes";
import {BlockStorage} from "./BlockStorage";
import {QueueManager} from "./queueManager";
import {Coll} from "../../utilz/coll";
import {Check} from "../../utilz/check";
import {WinstonUtil} from "../../utilz/winstonUtil";
import {StorageContractListener, StorageContractState} from "../messaging-common/storageContractState";
import {IndexStorage} from "./IndexStorage";

// todo reshard():
// raise a flag while executing this; handle new updates somehow?
// todo V2 reshard():
// redownload every block from peers (snodes),
// using the right virtual queue which exists for missing shards in (shardsToAdd)
@Service()
export default class StorageNode implements Consumer<QItem>, StorageContractListener {
  public log: Logger = WinstonUtil.newLog(StorageNode)

  @Inject()
  private valContractState: ValidatorContractState;

  @Inject()
  private storageContractState: StorageContractState;

  @Inject(type => QueueManager)
  private queueManager: QueueManager;

  @Inject()
  private blockStorage: BlockStorage;

  @Inject()
  private indexStorage: IndexStorage;

  private client: QueueClient;

  public async postConstruct() {
    await this.blockStorage.postConstruct();
    await this.indexStorage.postConstruct();
    await this.valContractState.postConstruct();
    await this.storageContractState.postConstruct(this);
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
    let activeValidators = Coll.arrayToFields(this.valContractState.getActiveValidators(), 'nodeId');
    let check1 = MessageBlockUtil.checkBlock(mb, activeValidators);
    if (!check1.success) {
      this.log.error('item validation failed: ', check1.err);
      return false;
    }
    // check database
    let shardSet = MessageBlockUtil.calculateAffectedShards(mb, this.storageContractState.shardCount);
    let isNew = await this.blockStorage.saveBlockWithShardData(mb, calculatedHash, shardSet);
    if (!isNew) {
      // this is not an error, because we read duplicates from every validator
      this.log.debug('block %s already exists ', mb.id);
      return false;
    }
    // send block
    await this.indexStorage.unpackBlockToInboxes(mb, shardSet);
  }


  public async handleReshard(currentNodeShards: Set<number>|null, allNodeShards: Map<string, Set<number>>) {
    let newShards = currentNodeShards;
    const oldShards = await this.blockStorage.loadNodeShards();
    this.log.debug('handleReshard(): newShards: %j oldShards: %j',
      Coll.setToArray(newShards), Coll.setToArray(oldShards))
    if (Coll.isEqualSet(newShards, oldShards)) {
      this.log.debug('handleReshard(): no reshard is needed')
      return;
    }
    let shardsToAdd = Coll.substractSet(newShards, oldShards);
    let shardsToDelete = Coll.substractSet(oldShards, newShards);
    let commonShards = Coll.intersectSet(oldShards, newShards);
    this.log.debug('shardsToAdd %j shardsToDelete %j shardsRemaining %j',
      Coll.setToArray(shardsToAdd),
      Coll.setToArray(shardsToDelete),
      Coll.setToArray(commonShards));

    await this.indexStorage.deleteShardsFromInboxes(shardsToDelete);

    // add to index
    // reprocess every block from blocks table (only once per each block)
    // if the block has shardsToAdd -> add anything which is in shardsToAdd
    const pageSize = 30;
    await this.blockStorage.iterateAllStoredBlocks(this.storageContractState.shardCount,
      pageSize,
      shardsToAdd,
      async (messageBlockJson, messageBlockHash, messageBlockShards) => {
        let mb: MessageBlock = JSON.parse(messageBlockJson);
        let shardsToAddFromBlock = Coll.intersectSet(shardsToAdd, messageBlockShards);
        this.log.debug('reindexing block %s, blockShards %s, shardsToAdd %s,, shardsToAddFromBlock',
          messageBlockHash, Coll.setToArray(messageBlockShards), Coll.setToArray(shardsToAdd), Coll.setToArray(shardsToAddFromBlock))
        await this.indexStorage.unpackBlockToInboxes(mb, shardsToAddFromBlock);
      });
    await this.blockStorage.saveNodeShards(newShards);
  }
}