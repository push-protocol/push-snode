import { Logger } from 'winston'

import { PgUtil } from '../../utilz/pgUtil' // Assuming pgutil is the PostgreSQL utility file
import { UrlUtil } from '../../utilz/urlUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { validatorRpc } from '../validatorRpc/validatorRpc'
import { Consumer, QItem } from './queueTypes'

export class QueueClient {
  public log: Logger = WinstonUtil.newLog(QueueClient)
  // remoteUrl: string // stored into db
  // offset: number // stored into db
  consumer: Consumer<QItem>
  queueName: string

  constructor(consumer: Consumer<QItem>, remoteQueueName: string) {
    this.consumer = consumer
    this.queueName = remoteQueueName
  }

  /**
   * Call in cycle until it returns true,
   * fetches maxRequests at max per each invocation per each endpoint
   * @param maxRequests
   * @returns true, if no more data available; false otherwise
   */
  public async pollRemoteQueue(maxRequests: number): Promise<any> {
    const result = []
    const sameQueueEndpoints = await PgUtil.queryArr<{
      id: number
      queue_name: string
      target_node_id: string
      target_node_url: string
      target_offset: number
    }>(
      `SELECT id, queue_name, target_node_id, target_node_url, target_offset
       FROM dset_client
       WHERE queue_name = $1
         AND state = 1
       ORDER BY id ASC`,
      this.queueName
    )

    for (const endpoint of sameQueueEndpoints) {
      // todo EVERY ENDPOINT CAN BE DONE IN PARALLEL
      // read data from the endpoint (in cycle) , update the offset in db
      const endpointStats = {
        queueName: this.queueName,
        target_node_id: endpoint.target_node_id,
        target_node_url: endpoint.target_node_url,
        queries: 0,
        downloadedItems: 0,
        newItems: 0,
        lastOffset: endpoint.target_offset
      }
      let lastOffset = endpoint.target_offset
      for (let i = 0; i < maxRequests; i++) {
        result.push(endpointStats)
        endpointStats.queries++
        const reply = await this.readItems(
          endpoint.queue_name,
          endpoint.target_node_url,
          lastOffset
        )
        if (!reply || reply.items?.length == 0) {
          break
        }
        for (const item of reply.items) {
          endpointStats.downloadedItems++
          let appendSuccessful = false
          try {
            appendSuccessful = await this.consumer.accept(item)
          } catch (e) {
            this.log.error('error processing accept(): queue %s: ', this.queueName)
            this.log.error(e)
          }
          if (appendSuccessful) {
            endpointStats.newItems++
          }
        }
        await PgUtil.update(
          'UPDATE dset_client SET target_offset = $1 WHERE id = $2',
          reply.lastOffset,
          endpoint.id
        )
        lastOffset = reply.lastOffset
        endpointStats.lastOffset = reply.lastOffset
      }
    }
    return {
      result: result
    }
  }

  public async readItems(
    queueName: string,
    baseUri: string,
    firstOffset: number = 0
  ): Promise<{ items: QItem[]; lastOffset: number } | null> {
    const url = UrlUtil.append(baseUri, '/api/v1/rpc/')
    try {
      const re = await validatorRpc.callPushReadBlockQueue(url, [firstOffset.toString()])

      this.log.debug('readItems %s from offset %d %o', url, firstOffset, re?.items)

      // Create the object with response data
      const obj: { items: QItem[]; lastOffset: number } = {
        items: re.items, // Use the fetched items here
        lastOffset: re.lastOffset
      }

      return obj
    } catch (e) {
      this.log.warn('readItems failed for url %s', url)
      return null
    }
  }

  public async readLastOffset({ queueName, baseUri }: { queueName?: string; baseUri: string }) {
    const url = UrlUtil.append(baseUri, '/api/v1/rpc/')
    return await validatorRpc.callPushReadBlockQueueSizeRpc(url)
  }
}
