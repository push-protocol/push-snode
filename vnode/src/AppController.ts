// noinspection SpellCheckingInspection

import {Body, Controller, Get, HttpException, HttpStatus, Logger, Param, Post} from "@nestjs/common";
import DbService from './loaders/dbService';
import StrUtil from "./helpers/strUtil";
import RandomUtil from "./helpers/randomUtil";
import axios, {AxiosResponse} from "axios";
import PromiseUtil, {PromiseResult} from "./helpers/promiseUtil";
import {AggregatedReplyHelper, NodeHttpStatus} from "./AggregatedReplyHelper";

interface nodeurl {
    nsName: string,
    nsIndex: string,
    dt: string,
    key: string
}

const {DateTime} = require("luxon");

const log = new Logger('UsersController');

// curl -X POST -H "Content-Type: application/json" --location "http://localhost:4000/api/v1/kv/ns/feeds/nsidx/1000/month/201501/list"

@Controller("/api/v1/kv")
export class AppController {
    private dbService: DbService;

    minQuorumThreshold:number;

    constructor(dbService: DbService) {
        this.dbService = dbService;
        this.minQuorumThreshold = Number.parseInt(process.env.VNODE_QUORUM_MIN);
        console.log(`initialized minQuorumThreshold=${this.minQuorumThreshold}`);
    }

    @Get("/ns/:nsName/nsidx/:nsIndex/date/:dt/key/:key")
    async findAll(@Param() params: nodeurl): Promise<any> {
        const shardid = await DbService.calculateShardForNamespaceIndex(params.nsName, params.nsIndex);
        console.log("Shard Id calculated from namespace and nsIdx : ", shardid);
        const node_ids = await this.dbService.findNodesByNamespaceAndShard(params.nsName, shardid);
        const number_of_nodes = node_ids.length;
        console.log("Node Ids for the shard : ", number_of_nodes);
        console.log("Node Ids for the shard : ", node_ids);
        var randomnodes = [];

        randomnodes = RandomUtil.getRandomSubArray(node_ids, (number_of_nodes / 2) + 1);
        console.log("Random Nodes : ", randomnodes);

        for (var i = 0; i < randomnodes.length - 1; i++) {
            const currnodeurl = await this.dbService.getNodeurlByNodeId(randomnodes[i]);
            const nextnodeurl = await this.dbService.getNodeurlByNodeId(randomnodes[i + 1]);
            var nodeId = randomnodes[i];
            log.debug("Current Node :", nodeId);
            console.log("Current Node Url : ", currnodeurl);

            const currurl = currnodeurl + "/api/v1/kv/ns/" + params.nsName + "/nsidx/" + params.nsIndex + "/date/" + params.dt + "/key/" + params.key;
            const nexturl = nextnodeurl + "/api/v1/kv/ns/" + params.nsName + "/nsidx/" + params.nsIndex + "/date/" + params.dt + "/key/" + params.key;

            const curr_response = await axios.get(currurl, {timeout: 3000});
            const next_response = await axios.get(nexturl, {timeout: 3000});

            log.debug("Currently comparing nodes : ", randomnodes[i], " and ", randomnodes[i + 1]);

            if (curr_response && next_response) {
                if (JSON.stringify(curr_response.data) === JSON.stringify(next_response.data)) {
                    console.log("Consistent Read");
                } else {
                    console.log("Inconsistent Read");
                    Promise.reject("Inconsistent Read");
                }
            } else {
                console.log("Error");
                Promise.reject("Error");
            }
        }
    }

    async doPut(baseUri: string, ns: string, nsIndex: string, ts: string, key: string, data: any): Promise<AxiosResponse> {
        let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/ts/${ts}/key/${key}`;
        console.log(`PUT ${url}`, data);
        let resp = await axios.post(url, data, {timeout: 5000});
        console.log(resp.status);
        return resp;
    }

    async doList(baseUri: string, ns: string, nsIndex: string, month: string, firstTs?: string): Promise<AxiosResponse> {
        let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/month/${month}/list/`;
        if (firstTs != null) {
            url += `?firstTs=${firstTs}`
        }
        let resp = await axios.post(url, {timeout: 3000});
        console.log('LIST', url, resp.status, resp.data);
        return resp;
    }

    @Post('/ns/:nsName/nsidx/:nsIndex/ts/:ts/key/:key')
    async postRecord(@Param('nsName') nsName: string,
                     @Param('nsIndex') nsIndex: string,
                     @Param('ts') ts: string,
                     @Param('key') key: string,
                     @Body() body: any): Promise<any> {
        log.debug(`put() nsName=${nsName}, nsIndex=${nsIndex}, ts=${ts}, key=${key}`);
        const shardId = DbService.calculateShardForNamespaceIndex(nsName, nsIndex);
        log.debug("shardId ", shardId);
        const nodeIdList: string[] = await this.dbService.findNodesByNamespaceAndShard(nsName, shardId);
        log.debug(`nodeIdList size=`, nodeIdList.length, nodeIdList);
        // todo V2 cache nodeIds and nodeUrls in ram, expire once per minute
        // todo V2 handle case where n/2+1 puts are sync, and rest can be async
        let promiseList: Promise<AxiosResponse>[] = [];
        for (let i = 0; i < nodeIdList.length; i++) {
            log.debug("query")
            let nodeId = nodeIdList[i];
            let nodeBaseUrl = await this.dbService.getNodeUrl(nodeId);
            if (StrUtil.isEmpty(nodeBaseUrl)) {
                throw new Error(`node: ${nodeId} has no url in the database`);
            }
            log.debug(`baseUrl=${nodeBaseUrl}`);
            promiseList.push(this.doPut(nodeBaseUrl, nsName, nsIndex, ts, key, body));
        }
        let allSettled = await PromiseUtil.allSettled(promiseList);
        let countFullfilled = 0;
        let count201 = 0;
        // TODO check why it won't compile if replaced with for(p in allSettled)
        allSettled.forEach(p => {
            log.debug(`promise: ${p.status} httpCode: `, p.val?.status);
            if (p.isFullfilled()) {
                countFullfilled++;
            }
            if (p.val?.status == 201) {
                count201++;
            }
        });
        if (countFullfilled == promiseList.length && count201 == promiseList.length) {
            log.debug("SUCCESS")
        } else {
            log.debug(`ERROR, countFullfilled=${countFullfilled}, count201=${count201} requests: ${promiseList.length}`)
            throw new HttpException('Forbidden', HttpStatus.GATEWAY_TIMEOUT);
        }
    }

    @Post('/ns/:nsName/nsidx/:nsIndex/month/:month/list/')
    async listRecordsByMonthStartFromTs(@Param('nsName') nsName: string,
                                        @Param('nsIndex') nsIndex: string,
                                        @Param('month') month: string,
                                        @Param('firstTs') firstTs: string,
                                        @Body() body: any): Promise<any> {
        log.debug(`listRecordsByMonthStartFromTs() nsName=${nsName}, nsIndex=${nsIndex}, month=${month}, firstTs=${firstTs}`);
        const shardId = DbService.calculateShardForNamespaceIndex(nsName, nsIndex);
        log.debug("shardId ", shardId);
        const nodeIdList: string[] = await this.dbService.findNodesByNamespaceAndShard(nsName, shardId);
        log.debug(`nodeIdList size=${nodeIdList.length} nodeIdList=${nodeIdList}`);

        // todo V2 cache nodeIds and nodeUrls in ram, expire once per minute
        // todo V2 handle case where n/2+1 list are sync, and rest can be async
        let promiseList: Promise<AxiosResponse>[] = [];
        for (let i = 0; i < nodeIdList.length; i++) {
            log.debug("query")
            let nodeId = nodeIdList[i];
            let nodeBaseUrl = await this.dbService.getNodeUrl(nodeId);
            if (StrUtil.isEmpty(nodeBaseUrl)) {
                throw new Error(`node: ${nodeId} has no url in the database`);
            }
            log.debug(`baseUrl=${nodeBaseUrl}`);
            promiseList.push(this.doList(nodeBaseUrl, nsName, nsIndex, month, firstTs));
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
        let ar = arh.aggregateItems(this.minQuorumThreshold);
        console.log('result');
        console.dir(ar);
        return ar;
    }
}

