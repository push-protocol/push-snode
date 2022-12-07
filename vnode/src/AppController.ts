import {Body, Controller, Get, HttpException, HttpStatus, Param, Post, Res} from "@nestjs/common";
import DbService from './loaders/dbService';
import StrUtil from "./helpers/strUtil";
import RandomUtil from "./helpers/randomUtil";
import axios, {AxiosResponse} from "axios";
import PromiseUtil, {WrappedResult} from "./helpers/promiseUtil";
import {Logger, Injectable} from '@nestjs/common';

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

    constructor(dbService: DbService) {
        this.dbService = dbService;
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
        for (let i = 0; i < number_of_nodes; i++) {
            randomnodes.push(node_ids[i.toString()].node_id);
        }
        randomnodes = RandomUtil.getRandomSubArray(randomnodes, number_of_nodes / 2 + 1);
        console.log("Random Nodes : ", randomnodes);

        /*for(var i=0;i<randomnodes.length;i++){
            const nodeurl = await db.getNodeUrl(randomnodes[i]);
            var nodeId = randomnodes[i];
            console.log("Current Node Url : ",nodeurl);

            const success = await db.checkThatShardIsOnThisNode(params.nsName, shardid, nodeId);
            if (!success) {
                let errMsg = `${params.nsName}.${params.nsIndex} maps to shard ${shardid} which is missing on node ${nodeId}`;
                console.log(errMsg);
                return Promise.reject(errMsg);
            }

            const date = DateTime.fromISO(params.dt, {zone: 'utc'});
            console.log(`parsed date ${params.dt} -> ${date}`)
            const storageTable = await db.findStorageTableByDate(params.nsName, shardid, date);
            console.log(`found table ${storageTable}`)
            if (StrUtil.isEmpty(storageTable)) {
                console.log('storage table not found');
                return ('storage table not found');
            }
            const storageValue = await db.findValueInTable(storageTable, params.key);
            console.log(`found value: ${storageValue}`)
            console.log('success is ' + success);
        }*/
    }

    async doPut(baseUri: string, ns: string, nsIndex: string, ts: string, key: string, data: any): Promise<AxiosResponse> {
        let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/ts/${ts}/key/${key}`;
        console.log(`PUT ${url}`, data);
        let resp = await axios.post(url, data, {timeout: 5000});
        console.log(resp.status);
        return resp;
    }

    @Post('/ns/:nsName/nsidx/:nsIndex/ts/:ts/key/:key')
    async put(@Param('nsName') nsName: string,
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
            log.debug(`promise: ${p.status} httpCode: `, p.value?.status);
            if (p.status == 'fulfilled') {
                countFullfilled++;
            }
            if (p.value?.status == 201) {
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
}