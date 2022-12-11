// noinspection SpellCheckingInspection

import {Body, Controller, Get, HttpException, HttpStatus, Logger, Param, Post, Query, Req} from "@nestjs/common";
import DbService from './loaders/dbService';
import StrUtil from "./helpers/strUtil";
import RandomUtil from "./helpers/randomUtil";
import axios, {AxiosResponse} from "axios";
import PromiseUtil, {PromiseResult} from "./helpers/promiseUtil";
import {AggregatedReplyHelper, NodeHttpStatus} from "./AggregatedReplyHelper";
import SNodeClient from "./client/snodeClient";

interface nodeurl {
    nsName: string,
    nsIndex: string,
    dt: string,
    key: string
}

const {DateTime} = require("luxon");
const log = new Logger('UsersController');


@Controller("/api/v1/kv")
export class AppController {
    private dbService: DbService;
    private sNodeClient:SNodeClient;
    private vnodeReadQuorum:number;
    private vnodeWriteQuorum: number;

    constructor(dbService: DbService) {
        this.dbService = dbService;
        // todo V2 dynamically calculate quorum based on network size
        this.vnodeReadQuorum = Number.parseInt(process.env.VNODE_READ_QUORUM);
        this.vnodeWriteQuorum = Number.parseInt(process.env.VNODE_WRITE_QUORUM);
        this.sNodeClient = new SNodeClient();
        console.log(`initialized vnodeReadQuorum=${this.vnodeReadQuorum}  vnodeWriteQuorum=${this.vnodeWriteQuorum}`);
    }

    @Get("/ns/:nsName/nsidx/:nsIndex/date/:dt/key/:key")
    async getRecord(@Param('nsName') nsName: string,
                    @Param('nsIndex') nsIndex: string,
                    @Param('dt') dt: string,
                    @Param('key') key: string): Promise<any> {
        log.debug(`getRecord() nsName=${nsName}, nsIndex=${nsIndex}, dt=${dt}, key=${key}`);
        const shardId = DbService.calculateShardForNamespaceIndex(nsName, nsIndex);
        log.debug("shardId=", shardId);
        let nodeIdList = await this.getNodeIdsForRead(nsName, shardId);

        let promiseList: Promise<AxiosResponse>[] = [];
        for (let i = 0; i < nodeIdList.length; i++) {
            log.debug("query")
            let nodeId = nodeIdList[i];
            let nodeBaseUrl = await this.dbService.getNodeUrl(nodeId);
            if (StrUtil.isEmpty(nodeBaseUrl)) {
                throw new Error(`node: ${nodeId} has no url in the database`);
            }
            log.debug(`baseUrl=${nodeBaseUrl}`);
            promiseList.push(this.sNodeClient.getRecord(nodeBaseUrl, nsName, nsIndex, dt, key));
        }
        let prList = await PromiseUtil.allSettled(promiseList);

        // handle reply
        let arh = new AggregatedReplyHelper();
        for (let i = 0; i < nodeIdList.length; i++) {
            let nodeId = nodeIdList[i];
            let pr = prList[i];
            let nodeHttpStatus = pr.isRejected() ? NodeHttpStatus.REPLY_TIMEOUT : pr.val?.status;
            let replyBody = pr.val?.data;
            log.debug(`promise: ${pr.status} nodeHttpStatus: ${nodeHttpStatus}`);
            log.debug(`body: ${JSON.stringify(replyBody)}`)
            arh.appendItems(nodeId, nodeHttpStatus, replyBody);
        }
        console.log('internal state');
        console.dir(arh);
        let ar = arh.aggregateItems(this.vnodeReadQuorum);
        console.log('result');
        console.dir(ar);
        return ar;
    }

    // todo V2 cache nodeIds and nodeUrls in ram, expire once per minute
    // todo V2 handle case where n/2+1 puts are sync, and rest can be async
    @Post('/ns/:nsName/nsidx/:nsIndex/ts/:ts/key/:key')
    async postRecord(@Param('nsName') nsName: string,
                     @Param('nsIndex') nsIndex: string,
                     @Param('ts') ts: string,
                     @Param('key') key: string,
                     @Body() body: any): Promise<any> {
        log.debug(`postRecord() nsName=${nsName}, nsIndex=${nsIndex}, ts=${ts}, key=${key}`);
        const shardId = DbService.calculateShardForNamespaceIndex(nsName, nsIndex);
        log.debug("shardId ", shardId);
        let nodeIdList = await this.getNodeIdsForWrite(nsName, shardId);

        let promiseList: Promise<AxiosResponse>[] = [];
        for (let i = 0; i < nodeIdList.length; i++) {
            log.debug("query")
            let nodeId = nodeIdList[i];
            let nodeBaseUrl = await this.dbService.getNodeUrl(nodeId);
            if (StrUtil.isEmpty(nodeBaseUrl)) {
                throw new Error(`node: ${nodeId} has no url in the database`);
            }
            log.debug(`baseUrl=${nodeBaseUrl}`);
            promiseList.push(this.sNodeClient.postRecord(nodeBaseUrl, nsName, nsIndex, ts, key, body));
        }
        let allSettled = await PromiseUtil.allSettled(promiseList);
        let countFullfilled = 0;
        let count201 = 0;
        // TODO check why it won't compile if replaced with for(p in allSettled)
        for (const p of allSettled) {
            log.debug(`promise: ${p.status} httpCode: `, p.val?.status);
            if (p.isFullfilled()) {
                countFullfilled++;
            }
            if (p.val?.status == 201) {
                count201++;
            }
        }
        if (countFullfilled == promiseList.length && count201 == promiseList.length) {
            log.debug("SUCCESS")
        } else {
            log.debug(`ERROR, countFullfilled=${countFullfilled}, count201=${count201} requests: ${promiseList.length}`)
            throw new HttpException('Forbidden', HttpStatus.GATEWAY_TIMEOUT);
        }
    }

    @Post('/ns/:nsName/nsidx/:nsIndex/month/:month/list/')
    async listRecordsByMonth(@Param('nsName') nsName: string,
                             @Param('nsIndex') nsIndex: string,
                             @Param('month') month: string,
                             @Query('firstTs') firstTs: string,
                             @Body() body: any): Promise<any> {
        log.debug(`listRecordsByMonthStartFromTs() nsName=${nsName}, nsIndex=${nsIndex}, month=${month}, firstTs=${firstTs}`);
        const shardId = DbService.calculateShardForNamespaceIndex(nsName, nsIndex);
        log.debug("shardId ", shardId);
        let nodeIdList = await this.getNodeIdsForRead(nsName, shardId);

        // todo V2 cache nodeIds and nodeUrls in ram, expire once per minute
        // todo V2 handle case where n/2+1 list are sync, and rest can be async
        // todo V2 query only specific amount of nodes
        let promiseList: Promise<AxiosResponse>[] = [];
        for (let i = 0; i < nodeIdList.length; i++) {
            log.debug("query")
            let nodeId = nodeIdList[i];
            let nodeBaseUrl = await this.dbService.getNodeUrl(nodeId);
            if (StrUtil.isEmpty(nodeBaseUrl)) {
                throw new Error(`node: ${nodeId} has no url in the database`);
            }
            log.debug(`baseUrl=${nodeBaseUrl}`);
            promiseList.push(this.sNodeClient.listRecordsByMonth(nodeBaseUrl, nsName, nsIndex, month, firstTs));
        }
        let prList = await PromiseUtil.allSettled(promiseList);

        // handle reply
        let arh = new AggregatedReplyHelper();
        for (let i = 0; i < nodeIdList.length; i++) {
            let nodeId = nodeIdList[i];
            let pr = prList[i];
            let nodeHttpStatus = pr.isRejected() ? NodeHttpStatus.REPLY_TIMEOUT : pr.val?.status;
            let replyBody = pr.val?.data;
            log.debug(`promise: ${pr.status} nodeHttpStatus: ${nodeHttpStatus}`);
            log.debug(`body: ${JSON.stringify(replyBody)}`)
            arh.appendItems(nodeId, nodeHttpStatus, replyBody);
        }
        console.log('internal state');
        console.dir(arh);
        let ar = arh.aggregateItems(this.vnodeReadQuorum);
        console.log('result');
        console.dir(ar);
        return ar;
    }

    private async getNodeIdsForWrite(nsName: string, shardId: number):Promise<string[]> {
        let nodeIdList: string[] = await this.dbService.findNodesByNamespaceAndShard(nsName, shardId);
        let result = RandomUtil.getRandomSubArray(nodeIdList, this.vnodeWriteQuorum);
        log.debug(`getNodeIdsForWrite size=${result.length} ${result}`);
        return result;
    }

    private async getNodeIdsForRead(nsName: string, shardId: number):Promise<string[]> {
        let nodeIdList: string[] = await this.dbService.findNodesByNamespaceAndShard(nsName, shardId);
        let result = RandomUtil.getRandomSubArray(nodeIdList, this.vnodeReadQuorum);
        log.debug(`getNodeIdsForRead size=${result.length} ${result}`);
        return result;
    }
}

