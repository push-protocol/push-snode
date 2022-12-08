import {Logger} from "@nestjs/common";
import crypto from "crypto";

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

    public aggregateItems(): AggregatedReply {
        // if we have this amount of SAME replies for a key => we have this key
        const quorumForKey = this.mapNodeToStatus.size / 2 + 1;
        log.debug(`quorumForKey=${quorumForKey}`);

        for (let [skey, mapNodeIdToStorageRecord] of this.mapKeyToNodeItems) {
            log.debug(`checking skey: ${skey}`);

            // let's figure out quorum for this skey, we have replies from every node
            let mapHashToCount = new Map<string, number>();
            for (let [nodeId, code] of this.mapNodeToStatus) {
                if(code == 200) {
                    let record = mapNodeIdToStorageRecord.get(nodeId);
                    let recordHash = record == null ? 'null' : record.computeMd5Hash();
                }
            }

        }
        return null; // TODO
    }
}

class CustomMap {



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
    QUORUM_OK,
    QUORUM_FAILED_NO_REPLIES,
    QUORUM_FAILED_BY_DATA
}

export class AggregatedReply {
    quorum: QuorumResult;
    items: StorageRecord[];
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
            .update(this.payload)
            .digest().toString();
    }
}