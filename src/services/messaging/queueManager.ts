import { Mutex } from 'async-mutex'
import schedule from 'node-schedule'
import { Inject, Service } from 'typedi'
import { Logger } from 'winston'

import { EnvLoader } from '../../utilz/envLoader'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { QueueClientHelper } from '../messaging-common/queueClientHelper'
import { ValidatorContractState } from '../messaging-common/validatorContractState'
import { QueueClient } from '../messaging-dset/queueClient'
import { QueueServer } from '../messaging-dset/queueServer'
import StorageNode from './storageNode'

@Service()
export class QueueManager {
  public log: Logger = WinstonUtil.newLog(QueueManager)

  @Inject((type) => ValidatorContractState)
  private contract: ValidatorContractState
  @Inject((type) => StorageNode)
  private storageNode: StorageNode

  // PING: schedule
  private readonly CLIENT_READ_SCHEDULE = EnvLoader.getPropertyOrDefault(
    'CLIENT_READ_SCHEDULE',
    '*/30 * * * * *'
  )

  public static QUEUE_MBLOCK = 'mblock'
  mblockQueue: QueueServer
  mblockClient: QueueClient

  constructor() {}

  private readonly CLIENT_REQUEST_PER_SCHEDULED_JOB = EnvLoader.getPropertyAsNumber(
    'CLIENT_REQUEST_PER_SCHEDULED_JOB',
    5
  )
  private static mutex = new Mutex()

  // client -> queue -?-> channelService -> table <------- client
  public async postConstruct() {
    this.log.debug('postConstruct')
    this.mblockClient = new QueueClient(this.storageNode, QueueManager.QUEUE_MBLOCK)
    await QueueClientHelper.initClientForEveryQueueForEveryValidator(this.contract, [
      QueueManager.QUEUE_MBLOCK
    ])
    const qs = this
    schedule.scheduleJob(this.CLIENT_READ_SCHEDULE, async function () {
      const dbgPrefix = 'pollRemoteQueue():'
      if (QueueManager.mutex.isLocked()) {
        qs.log.error('%s failed to aquire mutex, the cron is still running', dbgPrefix)
        return
      }
      await QueueManager.mutex.runExclusive(async () => {
        try {
          qs.log.info(`%s CRON started`, dbgPrefix)
          await qs.mblockClient.pollRemoteQueue(qs.CLIENT_REQUEST_PER_SCHEDULED_JOB)
        } catch (err) {
          qs.log.error(`%s CRON failed %o`, dbgPrefix, err)
        } finally {
          qs.log.info(`%s CRON finished`, dbgPrefix)
        }
      })
    })
  }

  public getQueue(queueName: string): QueueServer {
    if (queueName == 'subscribers') {
      return this.mblockQueue
    }
    throw new Error('invalid queue')
  }

  public async getQueueLastOffset(queueName: string): Promise<any> {
    const lastOffset = await this.getQueue(queueName).getLastOffset()
    return { result: lastOffset }
  }

  public async readItems(dsetName: string, firstOffset: number) {
    const q = this.getQueue(dsetName)
    return await q.readWithLastOffset(firstOffset)
  }

  public async pollRemoteQueues(): Promise<any> {
    const result = await this.mblockClient.pollRemoteQueue(1)
    return result
  }
}
