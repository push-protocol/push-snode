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
    nodeInfos: Map<string, NodeInfo>
    nodeIds: Map<number, Set<string>>
    mapNodeInfoToShards: Map<NodeInfo, Set<string>>

    async postConstruct(_shard: Set<number>){
        this.shards = _shard
        this.nodeInfos = new Map<string, NodeInfo>();
        this.nodeIds = new Map<number, Set<string>>();
        await this.getNodeIdFromShardId();
        await this.getNodeInfoFromNodeId();
    }

    async getNodeIdFromShardId(){
        for(const shardId of this.shards){
            const nodes = this.storageContractState.getStorageNodesForShard(shardId);
            this.log.info(`Nodes for shard ${shardId} are ${nodes}`);
            if(nodes !== null && nodes !== undefined && nodes.size >0){
               this.nodeIds.set(shardId, nodes);
            }
        }
    }

    async getNodeInfoFromNodeId(){
        for(const [shardId, nodes] of this.nodeIds){
            for(const node of nodes){
                const nodeInfo = await this.validatorContractState.getStorageNodesMap().get(node);
                this.log.info(`Node info for node ${node} is ${nodeInfo}`);
                if(nodeInfo !== null && nodeInfo !== undefined){
                    this.nodeInfos.set(node, nodeInfo);
                }
            }
        }
    }

}