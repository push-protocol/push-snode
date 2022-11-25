import { Controller, Get, Param } from "@nestjs/common";
import db from './helpers/dbHelper';
import random from 'random';
interface nodeurl {
    nsName:string,
    nsIndex:string,
    dt:string,
    key:string
}

function generateRandom(min: number, max: number) {
    let difference = max - min;
    let rand = Math.random();
    rand = Math.floor( rand * difference);
    rand = rand + min;
    return rand;
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
        for(var i=1;i<=number_of_nodes/2 + 1;i++){
            const randomnode = generateRandom(0,number_of_nodes);
            randomnodes.push(node_ids[randomnode.toString()].node_id);
        }
        console.log("Random nodes : ",randomnodes);
        for(var i=0;i<randomnodes.length;i++){
            const nodeurl = await db.getNodeUrl(randomnodes[i]);
            console.log("Current Node Url : ",nodeurl);
        }
    }
}