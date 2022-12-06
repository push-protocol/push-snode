import { Controller, Get, Param } from "@nestjs/common";
import dbhelper from './helpers/dbHelper';
import snodedb from "./helpers/dbHelper";
import StrUtil from "./helpers/strUtil";
import random from 'random';
import { DateTime } from "luxon";
import axios from 'axios';
import axiosRetry from "axios-retry";

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
        var rndIndex = Math.round(rnd01 * (nodeList.length - 1));
        var newNodeId = nodeList[rndIndex];
        nodeList.splice(rndIndex, 1);
        result.push(newNodeId);
    }
    return result;
}

axiosRetry(axios, { retries: 3 });



@Controller("/api/v1/kv")
export class UsersController {
    
    @Get("/ns/:nsName/nsidx/:nsIndex/date/:dt/key/:key")
    async findAll(@Param() params:nodeurl): Promise<any> {
        const shardid = await dbhelper.calculateShardForNamespaceIndex(params.nsName, params.nsIndex);
        console.log("Shard Id calculated from namespace and nsIdx : ",shardid);
        const node_ids = await dbhelper.getAllNodeIds(params.nsName, shardid);
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
            const nodeurl = await dbhelper.getNodeUrl(randomnodes[i]);
            var nodeId = randomnodes[i];
            console.log("Current Node Url : ",nodeurl);

            const success = await dbhelper.checkThatShardIsOnThisNode(params.nsName, shardid, nodeId);
            if (!success) {
                let errMsg = `${params.nsName}.${params.nsIndex} maps to shard ${shardid} which is missing on node ${nodeId}`;
                console.log(errMsg);
                return Promise.reject(errMsg);
            }
            
            try{
                const response = await axios.get(`http://localhost:4000/api/v1/kv/ns/${params.nsName}/nsidx/${params.nsIndex}/date/${params.dt}/key/${params.key}`,{timeout: 3000});
                console.log(response.data);
                Promise.resolve(response.data);
            }catch(err){
                console.log(err);
                Promise.reject(err);
            }


            
        }
    }
}