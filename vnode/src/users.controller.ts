import { Controller, Get, Param } from "@nestjs/common";
import db from './helpers/dbHelper';
import random from 'random';
interface nodeurl {
    nsName:string,
    nsIndex:string,
    dt:string,
    key:string
}

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
            console.log("Current Node Url : ",nodeurl);
        }
    }
}