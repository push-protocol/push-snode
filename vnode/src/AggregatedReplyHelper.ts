import {Logger} from "@nestjs/common";
import {StringCounter} from "./helpers/stringCounter";
const crypto = require("crypto");
const log = new Logger('AggregatedReplyHelper');

export class AggregatedReplyHelper {
    // initial request
    aggrReq: AggregatedRequest;
    // replies
    // nodeIds -> httpCode
    mapNodeToStatus: Map<string, number> = new Map<string, number>();
    // nodeIds item lists, reverted in a map
    // skey -> nodeId -> item
    mapKeyToNodeItems: Map<string, Map<string, StorageRecord>> = new Map<string, Map<string, StorageRecord>>();

    // add each node reply which contains [item, item, item]
    public appendItems(nodeId: string, nodeHttpStatus: number, httpReplyData: any) {
        this.mapNodeToStatus.set(nodeId, nodeHttpStatus);
        if (httpReplyData?.items?.length > 0) {
            for (let srcItem of httpReplyData.items) {
                let key = srcItem.key;
                let map2 = this.mapKeyToNodeItems.get(key);
                if (map2 == null) {
                    map2 = new Map<string, StorageRecord>();
                    this.mapKeyToNodeItems.set(key, map2);
                }
                let dstItem = new StorageRecord(srcItem.ns,
                    key, Number.parseFloat(srcItem.ts), srcItem.payload);
                map2.set(nodeId, dstItem);
            }
        }
    }

    private isEnoughReplies(requiredReplies: number): boolean {
        let goodReplies = 200;
        for (let [key, value] of this.mapNodeToStatus) {
            if (value == 200 || value == 204) {
                goodReplies++;
            }
        }
        if (goodReplies > requiredReplies) {
            return true;
        }
    }

    public aggregateItems(minQuorumThreshold:number): AggregatedReply {
        console.log(`aggregateItems()`)
        let reply = new AggregatedReply();
        // if we have this amount of SAME replies for a key => we have this key
        let nodeCount = this.mapNodeToStatus.size;
        console.log(`quorumForKey=${minQuorumThreshold} nodeCount=${nodeCount}`);

        for (let [skey, mapNodeIdToStorageRecord] of this.mapKeyToNodeItems) {
            console.log(`checking skey: ${skey}`);

            // let's figure out quorum for this skey, we have replies from every node
            let sc = new StringCounter();
            let goodReplies = 0;
            for (let [nodeId, code] of this.mapNodeToStatus) {
                if(code == 200) {
                    let record = mapNodeIdToStorageRecord.get(nodeId);
                    let recordKey = record?.key;
                    let recordHash = record == null ? 'null' : record.computeMd5Hash();
                    console.log(`recordKey=${recordKey}, recordHash=${recordHash}`);
                    sc.increment(recordHash, record);
                }
                if(code>=200 && code<300) {
                    goodReplies++;
                }
            }
            sc.iterateAndSort(false, (index, key, count, context) => {
                if(index == 0) {
                    // top result
                    if(count >= minQuorumThreshold) {
                        // we have enough items from nodes, that we can conclude this item as useful
                        reply.items.push(context);
                    } else {
                        // top item has not enough copies on the network
                        reply.result.keysWithoutQuorum.push();
                    }
                } else {
                    reply.result.keysWithoutQuorum.push();
                }
            });
            console.log(`non200Replies=${goodReplies}`);
            let r = reply.result;
            if(goodReplies < minQuorumThreshold) {
                // not enough nodes replies => we can't do anything
                r.quorumResult = QuorumResult.QUORUM_FAILED_MIN_REPLIES
            } else {
                // we have node replies
                if(reply.items.length == 0) {
                    // we have no good keys
                    r.quorumResult = r.keysWithoutQuorum.length > 0 ? QuorumResult.QUORUM_FAILED_BY_MIN_ITEMS : QuorumResult.QUORUM_OK;
                } else if(reply.items.length > 0) {
                    // we have good keys
                    r.quorumResult = r.keysWithoutQuorum.length > 0 ? QuorumResult.QUORUM_OK_PARTIAL : QuorumResult.QUORUM_OK;
                }
            }
            r.itemCount = reply.items.length;
            r.keysWithoutQuorumCount = r.keysWithoutQuorum.length;
            console.dir(sc, {depth: 5});
        }
        return reply;
    }
}


class AggregatedRequest {
    nsName: string;
    nsIndex: string;
    month: string;
    firstTs: string;


    constructor(nsName: string, nsIndex: string, month: string, firstTs: string) {
        this.nsName = nsName;
        this.nsIndex = nsIndex;
        this.month = month;
        this.firstTs = firstTs;
    }
}

export enum QuorumResult {
    QUORUM_OK = 'QUORUM_OK',
    QUORUM_OK_PARTIAL = 'QUORUM_OK_PARTIAL',
    QUORUM_FAILED_MIN_REPLIES = 'QUORUM_FAILED_MIN_REPLIES',
    QUORUM_FAILED_BY_MIN_ITEMS = 'QUORUM_FAILED_BY_MIN_ITEMS'
}

export class Result {
    quorumResult:QuorumResult;
    itemCount:number = 0;
    keysWithoutQuorumCount:number = 0;
    keysWithoutQuorum:string[] = [];
}

export class AggregatedReply {
    items: StorageRecord[] = [];
    result: Result = new Result();
}

// this is a single record , received from a node/list
export class StorageRecord {
    ns: string;
    key: string;
    ts: number;
    payload: any;

    constructor(ns: string, key: string, ts: number, payload: any) {
        this.ns = ns;
        this.key = key;
        this.ts = ts;
        this.payload = payload;
    }

    public computeMd5Hash(): string {
        return crypto.createHash('md5')
            .update(this.ns)
            .update(this.key)
            .update(this.ts + '')
            .update(JSON.stringify(this.payload))
            .digest().toString('hex');
    }
}