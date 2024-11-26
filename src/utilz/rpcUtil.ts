import axios from 'axios'

export class RpcUtils {
  baseUrl: string
  functionName: string
  params: any[] | object
  payload: any

  constructor(_baseUrl: string, _functionName: string, _params: any[] | object = []) {
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

  // override the parameters if you want to keep the rest constant
  async call(_functionName?: string, _params?: any[] | object) {
    try {
      if(_functionName && _params) {
        this.payload.method = _functionName
        this.payload.params = _params
      }
      const res = await axios.post(this.baseUrl, this.payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      })
     if( res.status == 200 && res.data.result) {
       return res
     } else {
        throw new Error(`Error calling ${this.baseUrl} ${res.data}`)
     }
    } catch (e) {
      console.error('error calling %s %s', this.baseUrl, e)
      throw e
    }
  }

  // function that calls with retires
  async callWithRetires(allowedRetries: number, retryDelay: number = 10000, _functionName?: string, _params?: any[] | object) {
    let retries = 0;
  
    while (retries <= allowedRetries) {
      try {
        const res = await this.call(_functionName?? this.functionName, _params?? this.params);
        
        // Check if the response is successful
        if (res && res.status === 200 && res.data) {
          return res;
        }
        
        // Log failed attempt
        console.log(`Attempt ${retries + 1} failed for ${_functionName}`);
      } catch (e) {
        console.error(`Error calling ${this.baseUrl} on attempt ${retries + 1}: ${e}`);
      }
  
      // Increment retries
      retries++;
  
      // Check if we've hit the retry limit
      if (retries > allowedRetries) {
        throw new Error(`Failed after ${allowedRetries} retries for ${_functionName}`);
      }
  
      // Wait for the delay before next attempt
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  
    // Fallback error in case the while loop exits unexpectedly
    throw new Error(`Unexpected failure for ${_functionName}`);
  }
}
