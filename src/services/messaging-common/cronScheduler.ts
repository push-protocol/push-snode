import * as nodeScheduler from "node-schedule"
import { WinstonUtil } from "../../utilz/winstonUtil"
import { IndexStorage } from "../messaging/IndexStorage"
import Container from "typedi"
import { Logger } from "winston"
import { BlockPooling } from "../block/blockPolling"
export class CronScheduler {
    indexStorage: IndexStorage
    blockPool: BlockPooling
    log: Logger = WinstonUtil.newLog(CronScheduler.name)
    postConstuct(){
        this.indexStorage = Container.get(IndexStorage)
        this.blockPool = Container.get(BlockPooling)
    }
    scheduleShardDeletionJob() {
        nodeScheduler.scheduleJob('*/5 * * * * *', async () => {
           this.log.info('deleteShardsFromInboxes():Cron job started for')
            await this.indexStorage.deleteShardsFromInboxes()
            this.log.info('deleteShardsFromInboxes():Cron job ended')
        })
    }
    scheduleShardPoolingJob() {
        nodeScheduler.scheduleJob('*/5 * * * * *', async () => {
            this.log.info('shardPoolingJob():Cron job started for')
            await this.blockPool.initiatePooling()
            this.log.info('shardPoolingJob():Cron job ended')
        })
    }
}