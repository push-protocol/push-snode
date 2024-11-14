import { Inject } from "typedi";
import { StorageContractState } from "../services/messaging-common/storageContractState";
import { NodeInfo, ValidatorContractState } from "../services/messaging-common/validatorContractState";
import { Logger } from "winston";
import { WinstonUtil } from "./winstonUtil";


export class SNodeSyncUtil {
    public log: Logger = WinstonUtil.newLog(SNodeSyncUtil)
    @Inject()
    private storageContractState: StorageContractState
    @Inject()
    private validatorContractState: ValidatorContractState

    shards: Set<number>
    nodeIds: Map<string, Set<number>>
    mapNodeInfoToShards: Map<NodeInfo, Set<number>>

    async postConstruct(_shard: Set<number>){
        this.shards = _shard
        this.nodeIds = new Map<string, Set<number>>();
        this.mapNodeInfoToShards = new Map<NodeInfo, Set<number>>();
        await this.getNodeIdFromShardId();
        await this.getNodeInfoFromNodeId();
    }

    async getNodeIdFromShardId(){
        for(const shardId of this.shards){
            const nodes = this.storageContractState.getStorageNodesForShard(shardId);
            this.log.info(`Nodes for shard ${shardId} are ${nodes}`);
            if(nodes !== null && nodes !== undefined && nodes.size >0){
                for(const node of nodes){
                    if(this.nodeIds.has(node)){
                        this.nodeIds.get(node)?.add(shardId);
                    }else{
                        this.nodeIds.set(node, new Set([shardId]));
                    }
                }
            }
        }
    }

    async getNodeInfoFromNodeId(){
        for( const [nodeId, shards] of this.nodeIds){
            const nodeInfo = await this.validatorContractState.getStorageNodesMap().get(nodeId);
            this.log.info(`Node info for node ${nodeId} is ${nodeInfo}`);
            if(nodeInfo !== null && nodeInfo !== undefined){
                this.mapNodeInfoToShards.set(nodeInfo, shards);
            }
        }
    }

}