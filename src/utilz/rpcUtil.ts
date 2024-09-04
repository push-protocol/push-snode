import axios from 'axios'

export class RpcUtils {
  baseUrl: string
  functionName: string
  params: any[]
  payload: any

  constructor(_baseUrl: string, _functionName: string, _params: any[]) {
    this.baseUrl = _baseUrl
    this.functionName = _functionName
    this.params = _params
    this.payload = {
      jsonrpc: '2.0',
      method: this.functionName,
      params: this.params,
      id: 1
    }
  }

  async call() {
    return await axios.post(this.baseUrl, this.payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }
}
