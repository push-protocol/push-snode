import { Wallet } from 'ethers'
import { Logger } from 'winston'

import {
  AttestBlockResult,
  Block,
  InitDid,
  Signer,
  Transaction,
  TxAttestorData,
  TxValidatorData,
  Vote
} from '../../generated/push/block_pb'
import { ArrayUtil } from '../../utilz/arrayUtil'
import { BitUtil } from '../../utilz/bitUtil'
import { ChainUtil } from '../../utilz/chainUtil'
import { Check } from '../../utilz/check'
import DateUtil from '../../utilz/dateUtil'
import { EnvLoader } from '../../utilz/envLoader'
import { EthUtil } from '../../utilz/ethUtil'
import { HashUtil } from '../../utilz/hashUtil'
import { NumUtil } from '../../utilz/numUtil'
import { SolUtil } from '../../utilz/solUtil'
import { StarkNetUtil } from '../../utilz/starkNetUtil'
import StrUtil from '../../utilz/strUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'

export class BlockUtil {
  public static readonly log: Logger = WinstonUtil.newLog(BlockUtil)

  // max serialized tx size
  public static readonly MAX_TRANSACTION_SIZE_BYTES = EnvLoader.getPropertyAsNumber(
    'MAX_TRANSACTION_SIZE_BYTES',
    1000000
  )
  // max total tx data in a block ,
  // when reached block would stop accepting transactions
  public static readonly MAX_TOTAL_TRANSACTION_SIZE_BYTES = EnvLoader.getPropertyAsNumber(
    'MAX_TOTAL_TRANSACTION_SIZE_BYTES',
    10 * 1000000
  )

  // max total tx count
  // when reached block would stop accepting transactions
  public static readonly MAX_TRANSACTIONS_PER_BLOCK = EnvLoader.getPropertyAsNumber(
    'MAX_TRANSACTION_PER_BLOCK',
    1000
  )

  // blocks older than this would get rejected by attestors
  // note: attestor should have an up-to-date clock time for this (!)
  public static ATTESTOR_MAX_BLOCK_AGE_SECONDS = EnvLoader.getPropertyAsNumber(
    'MAX_BLOCK_AGE_SECONDS',
    0
  )

  // we will cache incomplete blocks for this amount of seconds
  // attestSignatures will stop working after this time
  public static readonly MAX_BLOCK_ASSEMBLY_TIME_SECONDS = EnvLoader.getPropertyAsNumber(
    'MAX_BLOCK_ASSEMBLY_TIME_SECONDS',
    60
  )

  public static readonly VALID_VALIDATOR_VOTES: Set<number> = new Set<number>([1])
  public static readonly VALID_ATTESTOR_VOTES: Set<number> = new Set<number>([1, 2])
  public static readonly ATT_TOKEN_PREFIX = 'AT1'
  public static readonly VAL_TOKEN_PREFIX = 'VT1'

  public static parseTx(txRaw: Uint8Array): Transaction {
    if (txRaw == null || txRaw.length > BlockUtil.MAX_TRANSACTION_SIZE_BYTES) {
      throw new Error('tx size is too big')
    }
    const tx = Transaction.deserializeBinary(txRaw)
    return tx
  }

  public static parseBlock(bRaw: Uint8Array): Block {
    const b = Block.deserializeBinary(bRaw)
    return b
  }

  public static hashTxAsHex(txRaw: Uint8Array): string {
    return BitUtil.bytesToBase16(BlockUtil.hashTx(txRaw))
  }

  private static hashTx(txRaw: Uint8Array) {
    return HashUtil.sha256AsBytes(txRaw)
  }

  public static hashBlockAsHex(blockRaw: Uint8Array): string {
    return BitUtil.bytesToBase16(HashUtil.sha256AsBytes(blockRaw))
  }

  // when the block has not been signed, we still need a valid immutable hash based on tx data
  // this is used to cache the block contents
  // Deprecated
  public static hashBlockIncomplete(blockObj: Block): string {
    const txHashes: Uint8Array[] = []
    for (const txObj of blockObj.getTxobjList()) {
      const tx = txObj.getTx()
      const txHash = BlockUtil.hashTx(tx.serializeBinary())
      txHashes.push(txHash)
    }
    return BitUtil.bytesToBase16(HashUtil.sha256ArrayAsBytes(txHashes))
  }

  public static blockToJson(block: Block) {
    return JSON.stringify(block.toObject())
  }

  public static transactionToJson(tx: Transaction) {
    return JSON.stringify(tx.toObject())
  }

  public static blockToBase16(block: Block) {
    return BitUtil.bytesToBase16(block.serializeBinary())
  }

  public static transactionToBase16(tx: Transaction) {
    return BitUtil.bytesToBase16(tx.serializeBinary())
  }

  // 1) try to get first byte from caip address
  // eip155:5:0xD8634C39BBFd4033c0d3289C4515275102423681 -> d8 -> 216
  // and use it as shard
  // 2) take sha256(addr) ->
  // shard count is a smart contract constant; normally it should never change
  // lets read this value from a contract
  public static calculateAffectedShard(walletInCaip: string, shardCount: number): number | null {
    if (StrUtil.isEmpty(walletInCaip)) {
      return null
    }

    const [caip, err] = ChainUtil.parseCaipAddress(walletInCaip)
    if (err != null) {
      throw new Error('invalid caip address:' + err)
    }
    if (!(caip != null && !StrUtil.isEmpty(caip.addr) && caip.addr.length > 4)) {
      return null
    }
    const addrWithoutPrefix = !caip.addr.startsWith('0x') ? caip.addr : caip.addr.substring(2)
    const sha = HashUtil.sha256AsBytesEx(BitUtil.stringToBytesUtf(addrWithoutPrefix))
    const shardId = sha[0]
    Check.notNull(shardId)
    Check.isTrue(shardId >= 0 && shardId <= 255 && NumUtil.isRoundedInteger(shardId))
    Check.isTrue(shardCount >= 1)
    return shardId % shardCount
  }

  /**
   * Evaluates all messageBlock target recipients (normally these are addresses)
   * for every included packet
   *
   * And for every recipient finds which shard will host this address
   *
   * @param block
   * @param shardCount total amount of shards; see smart contract for this value
   * @returns a set of shard ids
   */
  static calculateAffectedShards(block: Block, shardCount: number): Set<number> {
    const shards = new Set<number>()
    for (const txObj of block.getTxobjList()) {
      const senderAndRecipients = [txObj.getTx().getSender(), ...txObj.getTx().getRecipientsList()]
      for (const wallet of senderAndRecipients) {
        const shardId = this.calculateAffectedShard(wallet, shardCount)
        if (shardId == null) {
          continue
        }
        shards.add(shardId)
      }
    }
    return shards
  }

  public static checkValidatorTokenFormat(apiTokenBytes: Uint8Array): CheckR {
    const token = BitUtil.bytesUtfToString(apiTokenBytes)
    if (StrUtil.isEmpty(token) || !token.startsWith(BlockUtil.VAL_TOKEN_PREFIX)) {
      return CheckR.failWithText(
        `invalid attestor token; ${StrUtil.fmt(apiTokenBytes)} should start with ${BlockUtil.ATT_TOKEN_PREFIX}`
      )
    }
    return CheckR.ok()
  }

  public static checkAttestTokenFormat(attestorTokenBytes: Uint8Array): CheckR {
    const token = BitUtil.bytesUtfToString(attestorTokenBytes)
    if (StrUtil.isEmpty(token) || !token.startsWith(BlockUtil.ATT_TOKEN_PREFIX)) {
      return CheckR.failWithText(
        `invalid attestor token; ${StrUtil.fmt(attestorTokenBytes)} should start with ${BlockUtil.ATT_TOKEN_PREFIX}`
      )
    }
    return CheckR.ok()
  }

  public static async signTxEVM(tx: Transaction, evmWallet: Wallet) {
    Check.isTrue(
      ArrayUtil.isEmpty(tx.getSignature_asU8()),
      ' clear the signature field first, signature is:' + tx.getSignature()
    )
    const tmpBytes = tx.serializeBinary()
    const sig = await EthUtil.signBytes(evmWallet, tmpBytes)
    tx.setSignature(sig)
  }

  public static async signTxSolana(tx: Transaction, solanaPrivateKey: Uint8Array) {
    Check.isTrue(
      ArrayUtil.isEmpty(tx.getSignature_asU8()),
      ' clear the signature field first, signature is:' + tx.getSignature()
    )
    const tmpBytes = tx.serializeBinary()
    const sig = SolUtil.signBytes(solanaPrivateKey, tmpBytes)
    tx.setSignature(sig)
  }

  public static async signTxStarkNet(tx: Transaction, starkNetPrivateKey: Uint8Array) {
    Check.isTrue(
      ArrayUtil.isEmpty(tx.getSignature_asU8()),
      ' clear the signature field first, signature is:' + tx.getSignature()
    )
    const tmpBytes = tx.serializeBinary()
    const sig = StarkNetUtil.signBytes(starkNetPrivateKey, tmpBytes)
    tx.setSignature(sig)
  }

  public static async checkTxSignature(tx: Transaction): Promise<CheckR> {
    const [caip, err] = ChainUtil.parseCaipAddress(tx.getSender())
    if (err != null) {
      return CheckR.failWithText('failed to parse caip address: ' + err)
    }
    if (!ArrayUtil.hasMinSize(tx.getSignature_asU8(), 4)) {
      return CheckR.failWithText('signature should have at least 4 bytes size')
    }
    this.log.debug('checking signature `%s`', StrUtil.fmt(tx.getSignature_asU8()))
    // todo if(tx.getCategory() === 'INIT_DID') or === startsWith("CUSTOM:") or ANY OTHER ?
    const sig = tx.getSignature_asU8()
    const tmp = Transaction.deserializeBinary(tx.serializeBinary())
    tmp.setSignature(null)
    const tmpBytes = tmp.serializeBinary()
    if (caip.namespace === 'eip155') {
      // EVM SIGNATURES
      const recoveredAddr = EthUtil.recoverAddressFromMsg(tmpBytes, sig)
      const valid = recoveredAddr === caip.addr
      this.log.debug('recoveredAddr %s; valid: %s', StrUtil.fmt(recoveredAddr), valid)
      if (!valid) {
        return CheckR.failWithText(`sender address${tx.getSender()} does not match recovered address ${recoveredAddr} 
        signature was: ${StrUtil.fmt(`${tx.getSignature()}`)}`)
      }
    } else if (caip.namespace === 'solana') {
      // EVM SIGNATURES
      const expectedPubKey = SolUtil.convertAddrToPubKey(caip.addr)
      const valid = SolUtil.checkSignature(expectedPubKey, tmpBytes, sig)
      this.log.debug('expectedPubKey %s; valid: %s', StrUtil.fmt(expectedPubKey), valid)
      if (!valid) {
        return CheckR.failWithText(`sender address ${tx.getSender()} does not match  
        signature: ${StrUtil.fmt(`${tx.getSignature()}`)}`)
      }
    } else if (caip.namespace === 'starknet') {
      return CheckR.failWithText('not suported')
      // STARKNET SIGNATURES
      // const expectedPubKey = StarkNetUtil.convertAddrToPubKey(caip.addr);
      // const valid = StarkNetUtil.checkSignature(expectedPubKey, tmpBytes, sig);
      // this.log.debug('expectedPubKey %s; valid: %s', StrUtil.fmt(expectedPubKey), valid);
      // if (!valid) {
      //   return CheckR.failWithText(`sender address ${tx.getSender()} does not match
      //   signature: ${StrUtil.fmt(`${tx.getSignature()}`)}`);
      // }
    } else {
      return CheckR.failWithText(`unsupported chain id: ${tx.getSender()}`)
    }
    return CheckR.ok()
  }

  public static async checkTx(tx: Transaction): Promise<CheckR> {
    const checkToken = BlockUtil.checkValidatorTokenFormat(tx.getApitoken_asU8())
    if (!checkToken.success) {
      return checkToken
    }
    if (tx.getType() != 0) {
      return CheckR.failWithText(`Only non-value transactions are supported`)
    }
    if (!ChainUtil.isFullCAIPAddress(tx.getSender())) {
      return CheckR.failWithText(
        `sender ${tx.getSender()} is not in full CAIP format ${tx.getSender()}`
      )
    }
    // todo how many recipients are required per each tx type?
    for (const recipientAddr of tx.getRecipientsList()) {
      if (!ChainUtil.isFullCAIPAddress(recipientAddr)) {
        return CheckR.failWithText(
          `recipient ${recipientAddr} is not in full CAIP format ${tx.getSender()}`
        )
      }
    }

    if (!ArrayUtil.hasMinSize(tx.getSalt_asU8(), 4)) {
      return CheckR.failWithText(
        `salt field requires >=4 bytes ; ` + StrUtil.fmt(tx.getSalt_asU8())
      )
    }

    const validSignature = await BlockUtil.checkTxSignature(tx)
    if (!validSignature.success) {
      return CheckR.failWithText(`signature field is invalid`)
    }
    return CheckR.ok()
  }

  public static async checkTxPayload(tx: Transaction): Promise<CheckR> {
    if (tx.getCategory() === 'INIT_DID') {
      const txData = InitDid.deserializeBinary(tx.getData_asU8())
      if (StrUtil.isEmpty(txData.getMasterpubkey())) {
        CheckR.failWithText(`masterPubKey missing`)
      }
      if (StrUtil.isEmpty(txData.getDerivedpubkey())) {
        CheckR.failWithText(`derivedPubKey missing`)
      }
      if (txData.getWallettoencderivedkeyMap().size < 1) {
        CheckR.failWithText(`encDerivedPrivKey missing`)
      }
    } else if (tx.getCategory().startsWith('CUSTOM:')) {
      // no checks for user-defined transactions
    } else {
      CheckR.failWithText(`unsupported transaction category`)
    }
    return CheckR.ok()
  }

  // for tests
  public static async signBlockAsValidator(wallet: Wallet, blockNoSigs: Block) {
    Check.isTrue(blockNoSigs.getSignersList().length == 0)
    for (const txObj of blockNoSigs.getTxobjList()) {
      const voteObj = new TxValidatorData()
      voteObj.setVote(Vote.ACCEPTED)
      txObj.setValidatordata(voteObj)
      txObj.clearAttestordataList()
    }
    const ethSig = await EthUtil.signBytes(wallet, blockNoSigs.serializeBinary())
    const vSign = new Signer()
    vSign.setSig(ethSig)
    blockNoSigs.setSignersList([vSign])
  }

  // for tests
  public static async signBlockAsAttestor(
    wallet: Wallet,
    blockSignedByV: Block
  ): Promise<AttestBlockResult> {
    const tmpBlock = Block.deserializeBinary(blockSignedByV.serializeBinary())
    Check.isTrue(blockSignedByV.getSignersList().length == 1)
    // tmp block with vsig + attestor data gets signed
    const ar = new AttestBlockResult()
    for (const txObj of tmpBlock.getTxobjList()) {
      const attestorData = new TxAttestorData()
      attestorData.setVote(Vote.ACCEPTED)

      ar.getAttestordataList().push(attestorData)
      txObj.setAttestordataList([attestorData])
    }

    const ethSig = await EthUtil.signBytes(wallet, tmpBlock.serializeBinary())

    // embed attestor data and signature into real object
    const aSign = new Signer()
    aSign.setSig(ethSig)
    ar.setSigner(aSign)
    return ar
  }

  // for tests
  public static async appendPatchAsValidator(
    wallet: Wallet,
    blockSignedByVA: Block,
    ar: AttestBlockResult
  ): Promise<void> {
    for (let txIndex = 0; txIndex < blockSignedByVA.getTxobjList().length; txIndex++) {
      const attestDataPerTx = ar.getAttestordataList()[txIndex]
      blockSignedByVA.getTxobjList()[txIndex].getAttestordataList().push(attestDataPerTx)
    }
    blockSignedByVA.getSignersList().push(ar.getSigner())
  }

  public static async recoverPatchAddress(
    wallet: Wallet,
    blockSignedByVA: Readonly<Block>,
    ar: AttestBlockResult
  ): Promise<string> {
    const tmpBlock = Block.deserializeBinary(blockSignedByVA.serializeBinary())
    // tx0 -> attest0, ...
    // is restructured into
    // block.txObj[0].tx -> attest0, ...
    for (let txIndex = 0; txIndex < tmpBlock.getTxobjList().length; txIndex++) {
      const attestDataPerTx = ar.getAttestordataList()[txIndex]
      tmpBlock.getTxobjList()[txIndex].setAttestordataList([attestDataPerTx])
    }

    const aSignatureBytes = ar.getSigner().getSig_asU8()
    const tmpBlockBytes = tmpBlock.serializeBinary()
    this.log.debug('recovery pub key from block with hash: %s', EthUtil.ethHash(tmpBlockBytes))
    const attestorNodeId = EthUtil.recoverAddressFromMsg(tmpBlockBytes, aSignatureBytes)
    this.log.debug('attestorNodeId %o', attestorNodeId)
    return attestorNodeId
  }

  public static async recoverSignerAddress(
    blockSignedByVA: Readonly<Block>,
    signerIndex: number
  ): Promise<string> {
    Check.isTrue(
      signerIndex >= 0 && signerIndex < blockSignedByVA.getSignersList().length,
      'signer out of index'
    )
    if (signerIndex == 0) {
      // validator
      const validatorSignature = blockSignedByVA.getSignersList()[0]?.getSig_asU8()
      Check.notNull(validatorSignature, 'validator signature is required')
      const tmpBlock = Block.deserializeBinary(blockSignedByVA.serializeBinary())
      tmpBlock.clearSignersList()
      for (const txObj of tmpBlock.getTxobjList()) {
        txObj.clearAttestordataList()
      }
      const blockBytesNoSigners = tmpBlock.serializeBinary()
      const blockValidatorNodeId = EthUtil.recoverAddressFromMsg(
        blockBytesNoSigners,
        validatorSignature
      )
      BlockUtil.log.debug('signature # %s by %s (validator) ', 0, blockValidatorNodeId)
      return blockValidatorNodeId
    } else {
      const tmpBlock = Block.deserializeBinary(blockSignedByVA.serializeBinary())
      const onlyVSignature = [blockSignedByVA.getSignersList()[0]]
      tmpBlock.setSignersList(onlyVSignature)
      for (let txIndex = 0; txIndex < tmpBlock.getTxobjList().length; txIndex++) {
        const txObj = tmpBlock.getTxobjList()[txIndex]
        const onlyOneAttestation = blockSignedByVA.getTxobjList()[txIndex].getAttestordataList()[
          signerIndex - 1
        ]
        txObj.setAttestordataList([onlyOneAttestation])
      }

      const blockBytesNoSignersAnd1Attest = tmpBlock.serializeBinary()
      const attSignature = blockSignedByVA.getSignersList()[signerIndex].getSig_asU8()
      const attNodeId = EthUtil.recoverAddressFromMsg(blockBytesNoSignersAnd1Attest, attSignature)
      BlockUtil.log.debug('signature # %s by %s ', signerIndex - 1, attNodeId)
      return attNodeId
    }
  }

  public static async checkBlockAsAttestor(
    blockSignedByV: Block,
    validatorsFromContract: Set<string>
  ): Promise<CheckR> {
    const checkToken = BlockUtil.checkAttestTokenFormat(blockSignedByV.getAttesttoken_asU8())
    if (!checkToken.success) {
      return checkToken
    }
    if (blockSignedByV.getTxobjList().length >= BlockUtil.MAX_TRANSACTIONS_PER_BLOCK) {
      return CheckR.failWithText(
        `block is full; tx count: ${blockSignedByV.getTxobjList().length} ; limit: ${BlockUtil.MAX_TRANSACTIONS_PER_BLOCK} `
      )
    }
    if (
      BlockUtil.ATTESTOR_MAX_BLOCK_AGE_SECONDS != null &&
      BlockUtil.ATTESTOR_MAX_BLOCK_AGE_SECONDS > 0 &&
      Math.abs(blockSignedByV.getTs() - DateUtil.currentTimeMillis()) >
        1000 * BlockUtil.ATTESTOR_MAX_BLOCK_AGE_SECONDS
    ) {
      return CheckR.failWithText(`block is too old: ${blockSignedByV.getTs()}`)
    }
    if (!ArrayUtil.hasMinSize(blockSignedByV.getAttesttoken_asU8(), 4)) {
      return CheckR.failWithText('attest token is missing or too small (4bytes min)')
    }
    // all tx should be valid
    let totalTxBytes = 0
    for (let i = 0; i < blockSignedByV.getTxobjList().length; i++) {
      const txObj = blockSignedByV.getTxobjList()[i]
      const tx = txObj.getTx()
      if (tx == null) {
        return CheckR.failWithText('empty transaction found!')
      }
      const txBytes = tx.serializeBinary().length
      totalTxBytes += txBytes
      if (txBytes > BlockUtil.MAX_TRANSACTION_SIZE_BYTES) {
        return CheckR.failWithText(
          `transaction size exceeds the limit: ${txBytes} ; limit: ${BlockUtil.MAX_TRANSACTION_SIZE_BYTES}`
        )
      }
      if (
        txObj.getValidatordata() == null ||
        !BlockUtil.VALID_VALIDATOR_VOTES.has(txObj.getValidatordata().getVote())
      ) {
        return CheckR.failWithText(`tx # ${i} has invalid validator data`)
      }
      const check1 = await BlockUtil.checkTx(tx)
      if (!check1.success) {
        return check1
      }
      const check2 = await BlockUtil.checkTxPayload(tx)
      if (!check2.success) {
        return check2
      }
    }
    if (totalTxBytes > BlockUtil.MAX_TOTAL_TRANSACTION_SIZE_BYTES) {
      return CheckR.failWithText(
        `total transaction size exceeds the limit: ${totalTxBytes} ; limit: ${BlockUtil.MAX_TOTAL_TRANSACTION_SIZE_BYTES}`
      )
    }
    // number of signatures should be equal to number of attestations
    if (blockSignedByV.getSignersList().length == 0) {
      return CheckR.failWithText(`at least validator signature is required`)
    }
    const sigCount = blockSignedByV.getSignersList().length
    for (const txObj of blockSignedByV.getTxobjList()) {
      if (txObj.getAttestordataList().length != sigCount - 1) {
        return CheckR.failWithText(
          `number of tx attestations (salt=${txObj.getTx().getSalt()}) does not match with signature count`
        )
      }
    }
    // do a v signature check
    const blockValidatorNodeId = await BlockUtil.recoverSignerAddress(blockSignedByV, 0)
    BlockUtil.log.debug('signature # %s by %s (validator) ', 0, blockValidatorNodeId)
    const allowed = validatorsFromContract.has(blockValidatorNodeId)
    Check.isTrue(allowed, `unregistered validator: ${blockValidatorNodeId}`)
    return CheckR.ok()
  }

  public static async checkBlockFinalized(
    blockSignedByVA: Block,
    validatorsFromContract: Set<string>,
    valPerBlockFromContract: number
  ) {
    const check1 = await BlockUtil.checkBlockAsAttestor(blockSignedByVA, validatorsFromContract)
    if (!check1.success) {
      return check1
    }
    const sigCount = blockSignedByVA.getSignersList().length
    if (sigCount != valPerBlockFromContract) {
      return CheckR.failWithText(
        `block has only ${sigCount} signatures; expected ${valPerBlockFromContract} signatures `
      )
    }
    for (const txObj of blockSignedByVA.getTxobjList()) {
      if (txObj.getAttestordataList().length != sigCount - 1) {
        return CheckR.failWithText(
          `number of tx attestations (salt=${txObj.getTx().getSalt()}) does not match with signature count`
        )
      }
    }

    const attestorCount = sigCount - 1
    for (let txIndex = 0; txIndex < blockSignedByVA.getTxobjList().length; txIndex++) {
      const txObj = blockSignedByVA.getTxobjList()[txIndex]
      const tx = txObj.getTx()
      if (tx == null) {
        return CheckR.failWithText('empty transaction found!')
      }
      if (
        txObj.getAttestordataList() == null ||
        txObj.getAttestordataList().length != attestorCount
      ) {
        return CheckR.failWithText(
          `tx # ${txIndex} has invalid number of attestations; ${txObj.getAttestordataList().length} instead of ${attestorCount}`
        )
      }
      for (const txAttData of txObj.getAttestordataList()) {
        if (txAttData == null || !BlockUtil.VALID_ATTESTOR_VOTES.has(txAttData.getVote())) {
          return CheckR.failWithText(`tx # ${txIndex} has invalid attestor data`)
        }
      }
    }

    // do A signature check
    // this requires clearing all signatures + all attestor data except the current one
    const tmpBlock = Block.deserializeBinary(blockSignedByVA.serializeBinary())
    const onlyVSignature = [blockSignedByVA.getSignersList()[0]]
    tmpBlock.setSignersList(onlyVSignature)
    for (let attIndex = 1; attIndex < sigCount; attIndex++) {
      const attNodeId = await BlockUtil.recoverSignerAddress(blockSignedByVA, attIndex)
      BlockUtil.log.debug('signature # %s by %s ', attIndex - 1, attNodeId)
      const allowed = validatorsFromContract.has(attNodeId)
      Check.isTrue(allowed, `unregistered validator_: ${attNodeId}`)
    }
    return CheckR.ok()
  }
}

export class CheckR {
  success: boolean
  err: string

  static failWithText(err: string): CheckR {
    return { success: false, err: err }
  }

  static ok(): CheckR {
    return { success: true, err: '' }
  }
}
