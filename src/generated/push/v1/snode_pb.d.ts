// package: push.v1
// file: push/v1/snode.proto

import * as jspb from 'google-protobuf'

export class GetTransactionsRequest extends jspb.Message {
  getWallet(): string
  setWallet(value: string): void

  getCategory(): CategoryMap[keyof CategoryMap]
  setCategory(value: CategoryMap[keyof CategoryMap]): void

  getTimestamp(): string
  setTimestamp(value: string): void

  getOrder(): OrderMap[keyof OrderMap]
  setOrder(value: OrderMap[keyof OrderMap]): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): GetTransactionsRequest.AsObject
  static toObject(
    includeInstance: boolean,
    msg: GetTransactionsRequest
  ): GetTransactionsRequest.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: GetTransactionsRequest, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): GetTransactionsRequest
  static deserializeBinaryFromReader(
    message: GetTransactionsRequest,
    reader: jspb.BinaryReader
  ): GetTransactionsRequest
}

export namespace GetTransactionsRequest {
  export type AsObject = {
    wallet: string
    category: CategoryMap[keyof CategoryMap]
    timestamp: string
    order: OrderMap[keyof OrderMap]
  }
}

export class GetTransactionRequest extends jspb.Message {
  getWallet(): string
  setWallet(value: string): void

  getCategory(): CategoryMap[keyof CategoryMap]
  setCategory(value: CategoryMap[keyof CategoryMap]): void

  getKey(): string
  setKey(value: string): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): GetTransactionRequest.AsObject
  static toObject(
    includeInstance: boolean,
    msg: GetTransactionRequest
  ): GetTransactionRequest.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: GetTransactionRequest, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): GetTransactionRequest
  static deserializeBinaryFromReader(
    message: GetTransactionRequest,
    reader: jspb.BinaryReader
  ): GetTransactionRequest
}

export namespace GetTransactionRequest {
  export type AsObject = {
    wallet: string
    category: CategoryMap[keyof CategoryMap]
    key: string
  }
}

export interface CategoryMap {
  INIT_DID: 0
}

export const Category: CategoryMap

export interface OrderMap {
  ASC: 0
  DESC: 1
}

export const Order: OrderMap
