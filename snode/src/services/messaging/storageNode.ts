import {Inject, Service} from 'typedi'
import {ValidatorContract} from "./validatorContract";
import {Logger} from "winston";
import {FeedItemSig, FPayload, MessageBlock, NetworkRole} from "./messageBlock";
import DbHelper from "../../helpers/dbHelper";
import {DateUtil, StrUtil} from "dstorage-common";
import {EthSig} from "../../utilz/ethSig";

@Service()
export default class StorageNode {

  @Inject()
  private contract: ValidatorContract;

  @Inject('logger')
  private log: Logger;

  public async postConstruct() {
    await this.contract.postConstruct();
  }

  // todo move to common
  public checkBlock(block: MessageBlock): CheckResult {
    if (block.requests.length != block.responses.length) {
      return CheckResult.failWithText(`message block has incorrect length ${block.requests.length}!=${block.responses.length}`);
    }
    let blockValidatorNodeId = null;
    let item0sig0 = block.responsesSignatures[0][0];
    if (item0sig0?.nodeMeta.role != NetworkRole.VALIDATOR
        || StrUtil.isEmpty(item0sig0?.nodeMeta.nodeId)) {
      return CheckResult.failWithText('first signature is not performed by a validator');
    }
    let result: FeedItemSig[] = [];
    for (let i = 0; i < block.responses.length; i++) {
      let payloadItem = block.requests[i];
      let feedItem = block.responses[i];
      // check signatures
      let feedItemSignatures = block.responsesSignatures[i];
      for (let j = 0; j < feedItemSignatures.length; j++) {
        let fiSig = feedItemSignatures[j];
        if (j == 0) {
          if (fiSig.nodeMeta.role != NetworkRole.VALIDATOR) {
            return CheckResult.failWithText(`First signature on a feed item should be  ${NetworkRole.VALIDATOR}`);
          }
        } else {
          if (fiSig.nodeMeta.role != NetworkRole.ATTESTER) {
            return CheckResult.failWithText(`2+ signature on a feed item should be  ${NetworkRole.ATTESTER}`);
          }
        }
        const valid = EthSig.check(fiSig.signature, fiSig.nodeMeta.nodeId, fiSig.nodeMeta, feedItem);
        if (!valid) {
          return CheckResult.failWithText(`signature is not valid`);
        } else {
          this.log.debug('valid signature %o', fiSig);
        }
        const validNodeId = this.contract.isActiveValidator(fiSig.nodeMeta.nodeId);
        if (!validNodeId) {
          return CheckResult.failWithText(`${fiSig.nodeMeta.nodeId} is not a valid nodeId from a contract`);
        } else {
          this.log.debug('valid nodeId %o', fiSig.nodeMeta.nodeId);
        }
      }
    }
    return CheckResult.ok();
  }
  // sends the block contents (internal messages from every response)
  // to every recipient's inbox
  public async unpackBlock(mb: MessageBlock) {
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

class CheckResult {
  success: boolean;
  err: string;


  static failWithText(err: string): CheckResult {
    return {success: false, err: err}
  }

  static ok(): CheckResult {
    return {success: true, err: ''}
  }

}


