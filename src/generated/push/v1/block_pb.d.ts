// package: push.v1
// file: push/v1/block.proto

import * as jspb from 'google-protobuf'

export class DidMapping extends jspb.Message {
  getDidmappingMap(): jspb.Map<string, string>
  clearDidmappingMap(): void
  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): DidMapping.AsObject
  static toObject(includeInstance: boolean, msg: DidMapping): DidMapping.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: DidMapping, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): DidMapping
  static deserializeBinaryFromReader(message: DidMapping, reader: jspb.BinaryReader): DidMapping
}

export namespace DidMapping {
  export type AsObject = {
    didmappingMap: Array<[string, string]>
  }
}

export class TxValidatorData extends jspb.Message {
  getVote(): VoteMap[keyof VoteMap]
  setVote(value: VoteMap[keyof VoteMap]): void

  hasDidmapping(): boolean
  clearDidmapping(): void
  getDidmapping(): DidMapping | undefined
  setDidmapping(value?: DidMapping): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): TxValidatorData.AsObject
  static toObject(includeInstance: boolean, msg: TxValidatorData): TxValidatorData.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: TxValidatorData, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): TxValidatorData
  static deserializeBinaryFromReader(
    message: TxValidatorData,
    reader: jspb.BinaryReader
  ): TxValidatorData
}

export namespace TxValidatorData {
  export type AsObject = {
    vote: VoteMap[keyof VoteMap]
    didmapping?: DidMapping.AsObject
  }
}

export class TxAttestorData extends jspb.Message {
  getVote(): VoteMap[keyof VoteMap]
  setVote(value: VoteMap[keyof VoteMap]): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): TxAttestorData.AsObject
  static toObject(includeInstance: boolean, msg: TxAttestorData): TxAttestorData.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: TxAttestorData, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): TxAttestorData
  static deserializeBinaryFromReader(
    message: TxAttestorData,
    reader: jspb.BinaryReader
  ): TxAttestorData
}

export namespace TxAttestorData {
  export type AsObject = {
    vote: VoteMap[keyof VoteMap]
  }
}

export class TransactionObj extends jspb.Message {
  hasTx(): boolean
  clearTx(): void
  getTx(): Transaction | undefined
  setTx(value?: Transaction): void

  hasValidatordata(): boolean
  clearValidatordata(): void
  getValidatordata(): TxValidatorData | undefined
  setValidatordata(value?: TxValidatorData): void

  clearAttestordataList(): void
  getAttestordataList(): Array<TxAttestorData>
  setAttestordataList(value: Array<TxAttestorData>): void
  addAttestordata(value?: TxAttestorData, index?: number): TxAttestorData

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): TransactionObj.AsObject
  static toObject(includeInstance: boolean, msg: TransactionObj): TransactionObj.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: TransactionObj, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): TransactionObj
  static deserializeBinaryFromReader(
    message: TransactionObj,
    reader: jspb.BinaryReader
  ): TransactionObj
}

export namespace TransactionObj {
  export type AsObject = {
    tx?: Transaction.AsObject
    validatordata?: TxValidatorData.AsObject
    attestordataList: Array<TxAttestorData.AsObject>
  }
}

export class Signer extends jspb.Message {
  getNode(): string
  setNode(value: string): void

  getRole(): RoleMap[keyof RoleMap]
  setRole(value: RoleMap[keyof RoleMap]): void

  getSig(): string
  setSig(value: string): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): Signer.AsObject
  static toObject(includeInstance: boolean, msg: Signer): Signer.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: Signer, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): Signer
  static deserializeBinaryFromReader(message: Signer, reader: jspb.BinaryReader): Signer
}

export namespace Signer {
  export type AsObject = {
    node: string
    role: RoleMap[keyof RoleMap]
    sig: string
  }
}

export class Block extends jspb.Message {
  getTs(): number
  setTs(value: number): void

  clearTxobjList(): void
  getTxobjList(): Array<TransactionObj>
  setTxobjList(value: Array<TransactionObj>): void
  addTxobj(value?: TransactionObj, index?: number): TransactionObj

  clearSignersList(): void
  getSignersList(): Array<Signer>
  setSignersList(value: Array<Signer>): void
  addSigners(value?: Signer, index?: number): Signer

  getAttesttoken(): Uint8Array | string
  getAttesttoken_asU8(): Uint8Array
  getAttesttoken_asB64(): string
  setAttesttoken(value: Uint8Array | string): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): Block.AsObject
  static toObject(includeInstance: boolean, msg: Block): Block.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: Block, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): Block
  static deserializeBinaryFromReader(message: Block, reader: jspb.BinaryReader): Block
}

export namespace Block {
  export type AsObject = {
    ts: number
    txobjList: Array<TransactionObj.AsObject>
    signersList: Array<Signer.AsObject>
    attesttoken: Uint8Array | string
  }
}

export class Transaction extends jspb.Message {
  getType(): number
  setType(value: number): void

  getCategory(): string
  setCategory(value: string): void

  getSource(): string
  setSource(value: string): void

  clearRecipientsList(): void
  getRecipientsList(): Array<string>
  setRecipientsList(value: Array<string>): void
  addRecipients(value: string, index?: number): string

  getData(): Uint8Array | string
  getData_asU8(): Uint8Array
  getData_asB64(): string
  setData(value: Uint8Array | string): void

  getSalt(): Uint8Array | string
  getSalt_asU8(): Uint8Array
  getSalt_asB64(): string
  setSalt(value: Uint8Array | string): void

  getApitoken(): Uint8Array | string
  getApitoken_asU8(): Uint8Array
  getApitoken_asB64(): string
  setApitoken(value: Uint8Array | string): void

  getSignature(): Uint8Array | string
  getSignature_asU8(): Uint8Array
  getSignature_asB64(): string
  setSignature(value: Uint8Array | string): void

  getFee(): string
  setFee(value: string): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): Transaction.AsObject
  static toObject(includeInstance: boolean, msg: Transaction): Transaction.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: Transaction, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): Transaction
  static deserializeBinaryFromReader(message: Transaction, reader: jspb.BinaryReader): Transaction
}

export namespace Transaction {
  export type AsObject = {
    type: number
    category: string
    source: string
    recipientsList: Array<string>
    data: Uint8Array | string
    salt: Uint8Array | string
    apitoken: Uint8Array | string
    signature: Uint8Array | string
    fee: string
  }
}

export class InitDid extends jspb.Message {
  getDid(): string
  setDid(value: string): void

  getMasterpubkey(): string
  setMasterpubkey(value: string): void

  getDerivedkeyindex(): number
  setDerivedkeyindex(value: number): void

  getDerivedpubkey(): string
  setDerivedpubkey(value: string): void

  getEncderivedprivkey(): string
  setEncderivedprivkey(value: string): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): InitDid.AsObject
  static toObject(includeInstance: boolean, msg: InitDid): InitDid.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: InitDid, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): InitDid
  static deserializeBinaryFromReader(message: InitDid, reader: jspb.BinaryReader): InitDid
}

export namespace InitDid {
  export type AsObject = {
    did: string
    masterpubkey: string
    derivedkeyindex: number
    derivedpubkey: string
    encderivedprivkey: string
  }
}

export class SessionKeyAction extends jspb.Message {
  getKeyindex(): number
  setKeyindex(value: number): void

  getKeyaddress(): string
  setKeyaddress(value: string): void

  getAction(): KeyActionMap[keyof KeyActionMap]
  setAction(value: KeyActionMap[keyof KeyActionMap]): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): SessionKeyAction.AsObject
  static toObject(includeInstance: boolean, msg: SessionKeyAction): SessionKeyAction.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: SessionKeyAction, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): SessionKeyAction
  static deserializeBinaryFromReader(
    message: SessionKeyAction,
    reader: jspb.BinaryReader
  ): SessionKeyAction
}

export namespace SessionKeyAction {
  export type AsObject = {
    keyindex: number
    keyaddress: string
    action: KeyActionMap[keyof KeyActionMap]
  }
}

export class Notification extends jspb.Message {
  getApp(): string
  setApp(value: string): void

  getTitle(): string
  setTitle(value: string): void

  getBody(): string
  setBody(value: string): void

  getChannelurl(): string
  setChannelurl(value: string): void

  getActionurl(): string
  setActionurl(value: string): void

  getImg(): string
  setImg(value: string): void

  getIcon(): string
  setIcon(value: string): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): Notification.AsObject
  static toObject(includeInstance: boolean, msg: Notification): Notification.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: Notification, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): Notification
  static deserializeBinaryFromReader(message: Notification, reader: jspb.BinaryReader): Notification
}

export namespace Notification {
  export type AsObject = {
    app: string
    title: string
    body: string
    channelurl: string
    actionurl: string
    img: string
    icon: string
  }
}

export class EncryptionDetails extends jspb.Message {
  getRecipientdid(): string
  setRecipientdid(value: string): void

  getType(): EncryptionTypeMap[keyof EncryptionTypeMap]
  setType(value: EncryptionTypeMap[keyof EncryptionTypeMap]): void

  getKeyindex(): number
  setKeyindex(value: number): void

  getEncryptedsecret(): Uint8Array | string
  getEncryptedsecret_asU8(): Uint8Array
  getEncryptedsecret_asB64(): string
  setEncryptedsecret(value: Uint8Array | string): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): EncryptionDetails.AsObject
  static toObject(includeInstance: boolean, msg: EncryptionDetails): EncryptionDetails.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: EncryptionDetails, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): EncryptionDetails
  static deserializeBinaryFromReader(
    message: EncryptionDetails,
    reader: jspb.BinaryReader
  ): EncryptionDetails
}

export namespace EncryptionDetails {
  export type AsObject = {
    recipientdid: string
    type: EncryptionTypeMap[keyof EncryptionTypeMap]
    keyindex: number
    encryptedsecret: Uint8Array | string
  }
}

export class EncryptedNotif extends jspb.Message {
  getEncryptednotif(): Uint8Array | string
  getEncryptednotif_asU8(): Uint8Array
  getEncryptednotif_asB64(): string
  setEncryptednotif(value: Uint8Array | string): void

  hasSourceenc(): boolean
  clearSourceenc(): void
  getSourceenc(): EncryptionDetails | undefined
  setSourceenc(value?: EncryptionDetails): void

  clearTargetencList(): void
  getTargetencList(): Array<EncryptionDetails>
  setTargetencList(value: Array<EncryptionDetails>): void
  addTargetenc(value?: EncryptionDetails, index?: number): EncryptionDetails

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): EncryptedNotif.AsObject
  static toObject(includeInstance: boolean, msg: EncryptedNotif): EncryptedNotif.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: EncryptedNotif, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): EncryptedNotif
  static deserializeBinaryFromReader(
    message: EncryptedNotif,
    reader: jspb.BinaryReader
  ): EncryptedNotif
}

export namespace EncryptedNotif {
  export type AsObject = {
    encryptednotif: Uint8Array | string
    sourceenc?: EncryptionDetails.AsObject
    targetencList: Array<EncryptionDetails.AsObject>
  }
}

export class Attachment extends jspb.Message {
  getFilename(): string
  setFilename(value: string): void

  getType(): string
  setType(value: string): void

  getContent(): string
  setContent(value: string): void

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): Attachment.AsObject
  static toObject(includeInstance: boolean, msg: Attachment): Attachment.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: Attachment, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): Attachment
  static deserializeBinaryFromReader(message: Attachment, reader: jspb.BinaryReader): Attachment
}

export namespace Attachment {
  export type AsObject = {
    filename: string
    type: string
    content: string
  }
}

export class Email extends jspb.Message {
  getSubject(): string
  setSubject(value: string): void

  getBody(): string
  setBody(value: string): void

  clearAttachmentsList(): void
  getAttachmentsList(): Array<Attachment>
  setAttachmentsList(value: Array<Attachment>): void
  addAttachments(value?: Attachment, index?: number): Attachment

  serializeBinary(): Uint8Array
  toObject(includeInstance?: boolean): Email.AsObject
  static toObject(includeInstance: boolean, msg: Email): Email.AsObject
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
  static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
  static serializeBinaryToWriter(message: Email, writer: jspb.BinaryWriter): void
  static deserializeBinary(bytes: Uint8Array): Email
  static deserializeBinaryFromReader(message: Email, reader: jspb.BinaryReader): Email
}

export namespace Email {
  export type AsObject = {
    subject: string
    body: string
    attachmentsList: Array<Attachment.AsObject>
  }
}

export interface RoleMap {
  ROLE_UNSPECIFIED: 0
  VALIDATOR: 1
  ATTESTER: 2
}

export const Role: RoleMap

export interface VoteMap {
  VOTE_UNSPECIFIED: 0
  ACCEPTED: 1
  REJECTED: 2
}

export const Vote: VoteMap

export interface KeyActionMap {
  UNSPECIFIED: 0
  PUBLISH_KEY: 1
  REVOKE_KEY: 2
}

export const KeyAction: KeyActionMap

export interface EncryptionTypeMap {
  ENCRYPTION_UNSPECIFIED: 0
  ECC: 1
}

export const EncryptionType: EncryptionTypeMap
