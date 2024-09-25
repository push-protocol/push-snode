import { Service } from 'typedi'

import { RpcUtils } from '../../utilz/rpcUtil'

type PushReadBlockQueueSizeResponse = {
  lastOffset: number
}
@Service()
export class validatorRpc {
  constructor() {}

  static async callPushReadBlockQueueSizeRpc(url: string) {
    const rpc = new RpcUtils(url, 'pushReadBlockQueueSize', [])
    const res = await rpc.call()
    if (res) {
      return res.data as PushReadBlockQueueSizeResponse
    }
    return null
  }

  static async callPushReadBlockQueue(url: string, params: any[] = ['0']) {
    const rpc = new RpcUtils(url, 'push_readBlockQueue', params)
    const res = await rpc.call()
    if (res.data) {
      return res.data.result
    }
    return null
  }
}
