import * as nodeScheduler from "node-schedule"
import { WinstonUtil } from "../../utilz/winstonUtil"
import { IndexStorage } from "../messaging/IndexStorage"
import Container from "typedi"
import { Logger } from "winston"

export class CronScheduler {
    indexStorage: IndexStorage
    log: Logger = WinstonUtil.newLog(CronScheduler.name)
    postConstuct(){
        this.indexStorage = Container.get(IndexStorage)
    }
    scheduleCronJob() {
        nodeScheduler.scheduleJob('*/5 * * * * *', async () => {
           this.log.info('deleteShardsFromInboxes():Cron job started for')
            await this.indexStorage.deleteShardsFromInboxes()
            this.log.info('deleteShardsFromInboxes():Cron job ended')
        })
    }
}