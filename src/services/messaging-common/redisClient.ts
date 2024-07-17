import { createClient, RedisClientType } from 'redis'
import config from '../../config'
import { Logger } from 'winston'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { Service } from 'typedi'

@Service()
export class RedisClient {
  public log: Logger = WinstonUtil.newLog(RedisClient)
  private client: RedisClientType

  public async postConstruct(): Promise<any> {
    this.client = await createClient({
      url: config.REDIS_URL
    })
    await this.client.connect()
    this.client.on('error', (err) => this.log.error('Redis Client Error', err))
    await this.client.set('connection', 'Redis connection successful') // todo do we need this line?
  }

  public getClient(): RedisClientType {
    return this.client
  }
}
