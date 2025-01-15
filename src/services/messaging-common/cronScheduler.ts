import * as nodeScheduler from "node-schedule"
import { WinstonUtil } from "../../utilz/winstonUtil"
import { IndexStorage } from "../messaging/IndexStorage"
import Container, { Service } from "typedi"
import { Logger } from "winston"
import { Block } from "../block/block"

@Service()
export class CronScheduler {
    private indexStorage: IndexStorage
    private log: Logger = WinstonUtil.newLog(CronScheduler.name)

    public async postConstruct() {
        this.indexStorage = Container.get(IndexStorage)
        await this.initializeScheduledJobs()

    }

    public initializeScheduledJobs() {
        this.scheduleShardDeletionJob()
        this.scheduleSyncTableDeletionJob()
    }

    private scheduleShardDeletionJob() {
        this.log.info('Scheduling Shard Deletion Job')
        nodeScheduler.scheduleJob('*/5 * * * *', async () => {
            try {
                this.log.info('Shard Deletion Job: Started')
                await this.indexStorage.deleteShardsFromInboxes()
                await this.indexStorage.deleteExpiredBlocksPaginated()
                this.log.info('Shard Deletion Job: Completed')
            } catch (error) {
                console.log(error)
                this.log.error('Shard Deletion Job: Error occurred %o', { error })
            }
        })
    }

    private scheduleSyncTableDeletionJob() {
        this.log.info('Scheduling Sync Table Deletion Job')
        nodeScheduler.scheduleJob('*/5 * * * *', async () => {
            try {
                this.log.info('Sync Table Deletion Job: Started')
                await Block.dropExpiredTables()
                await Block.dropSyncedTables()
                this.log.info('Sync Table Deletion Job: Completed')
            } catch (error) {
                console.log(error)
                this.log.error('Sync Table Deletion Job: Error occurred %o', { error })
            }
        })
    }
}