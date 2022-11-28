import { Controller, Get, Param } from "@nestjs/common";
import db from './helpers/dbHelper';
import snodedb from "./helpers/dbHelper";
import StrUtil from "./helpers/strUtil";
import random from 'random';
interface nodeurl {
    nsName:string,
    nsIndex:string,
    dt:string,
    key:string
}

const {DateTime} = require("luxon");

function getRandomNodesAsList(randomNodeCount, nodeList) {
    let result = [];
    for (let i = 0; i < Math.min(randomNodeCount, nodeList.length); i++) {
        console.log(`nodeList`, nodeList)
        let rnd01 = Math.random();
        console.log('rnd01 is', rnd01);
        var rndIndex = Math.round(rnd01 * (nodeList.length - 1));
        var newNodeId = nodeList[rndIndex];
        console.log(`rndIndex=${rndIndex} newNodeId=${newNodeId}`)
        nodeList.splice(rndIndex, 1);
        result.push(newNodeId);
    }
    return result;
}

@Controller("/api/v1/kv")
export class UsersController {

    @Get("/ns/:nsName/nsidx/:nsIndex/date/:dt/key/:key")
    async findAll(@Param() params:nodeurl): Promise<any> {
        const shardid = await db.calculateShardForNamespaceIndex(params.nsName, params.nsIndex);
        console.log("Shard Id calculated from namespace and nsIdx : ",shardid);
        const node_ids = await db.getAllNodeIds(params.nsName, shardid);
        const number_of_nodes = node_ids.length;
        console.log("Node Ids for the shard : ",number_of_nodes);
        console.log("Node Ids for the shard : ",node_ids);
        var randomnodes = [];
        for(let i=0;i<number_of_nodes;i++){
            randomnodes.push(node_ids[i.toString()].node_id);
        }
        randomnodes = getRandomNodesAsList(number_of_nodes/2 + 1, randomnodes);
        console.log("Random Nodes : ",randomnodes);

        for(var i=0;i<randomnodes.length;i++){
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
                return Promise.resolve('storage table not found');
            }
            const storageValue = await db.findValueInTable(storageTable, params.key);
            console.log(`found value: ${storageValue}`)
            console.log('success is ' + success);
            try {
                // const messaging = Container.get(MessagingService);
                return Promise.resolve(storageValue);
            } catch (e) {
                // log.error('🔥 error: %o', e);
                return Promise.reject(e);
            }
        }
    }
}