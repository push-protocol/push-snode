import axios, {AxiosError} from "axios";
import {Logger} from "winston";
import {WinstonUtil} from "./winstonUtil";


export class JsonRpcClient {
  public static log: Logger = WinstonUtil.newLog(JsonRpcClient);
  requestCounter: number = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER / 10000);

  constructor(public timeout: number, public baseRpcUri: string) {
  }

  public async call<T>(method: string, params: any[], resultDeserializer: (result: any) => T): Promise<Tuple<T, RpcError>> {
    const url = this.baseRpcUri;
    const requestId = this.requestCounter++;
    const req = {
      jsonrpc: "2.0",
      method,
      params,
      id: requestId,
    };
    try {
      JsonRpcClient.log.debug(`>> Calling RPC POST ${url} (req${requestId}) with body %o`, req);
      const axiosResp = await axios.post(url, req,
        {
          timeout: this.timeout,
          headers: {"Content-Type": "application/json"}
        });
      const resp = axiosResp.data;
      const errorCode = resp?.error?.code;
      const errorMessage = resp?.error?.message;
      JsonRpcClient.log.debug(`<< RPC Reply POST ${url} (req${requestId}) code: ${axiosResp.status} with body: %o`, resp);
      if (axiosResp.status !== 200) {
        return [null, new RpcError(errorCode ?? axiosResp.status, errorMessage ?? 'Call error')];
      }
      if (resp?.error != null) {
        return [null, new RpcError(errorCode ?? -3, 'remote rpc error: ' + errorMessage)];
      }
      if (resp?.id !== requestId) {
        return [null, new RpcError(-2, 'Call error: Request id does not match reply id')];
      }
      const resultField = resp?.result;
      if (!resultField) {
        return [null, new RpcError(-1, 'Missing reply data')];
      }
      const result = resultDeserializer(resultField);
      return [result, null];
    } catch (error) {
      JsonRpcClient.log.debug(`Request failed: ${error}`);
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        return [null, new RpcError(
          axiosError.response?.status ?? -1,
          'http error: ' + axiosError.name + ' ' + axiosError.code + ' ' + axiosError.message
        )];
      }
      return [null, new RpcError(-1, 'Request failed')];
    }
  }
}

export class RpcError {
  // todo use single field code , or add httpCode for clarity?
  code: number;
  message: string;

  constructor(code: number, message: string) {
    this.code = code;
    this.message = message;
  }
}