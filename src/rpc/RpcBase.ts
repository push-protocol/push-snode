export interface IRpc<TParams = unknown, TResult = unknown> {
  constructErrorMessage: (errorMessage: string) => Error
  execute(params: TParams): Promise<TResult>
  validate(params: TParams): boolean
}

export abstract class RpcBase<TParams = unknown, TResult = unknown>
  implements IRpc<TParams, TResult>
{
  public constructErrorMessage(errorMessage: string): Error {
    const error = new Error(errorMessage) as Error & { data?: unknown }
    error.data = { error: errorMessage }
    return error
  }

  public abstract execute(params: TParams): Promise<TResult>
  public abstract validate(params: TParams): boolean
}
