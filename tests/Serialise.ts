import { Block, Signer, TransactionObj } from '../src/generated/push/v1/block_pb'
import { GetTransactionRequest, GetTransactionsRequest } from '../src/generated/push/v1/snode_pb'
import { BitUtil } from '../src/utilz/bitUtil'
import DateUtil from '../src/utilz/dateUtil'
const serailiaseAndDeserialiseGetTransactionsRequest = () => {
  const getTransactionsRequest = new GetTransactionsRequest()
  getTransactionsRequest.setWallet('eip155:1:0x69e666767Ba3a661369e1e2F572EdE7ADC926029')
  getTransactionsRequest.setCategory(0)
  getTransactionsRequest.setTimestamp('1724667419')
  getTransactionsRequest.setOrder(0)
  const bytes = getTransactionsRequest.serializeBinary()
  console.log('Serialized (bytes):', bytes)
  const base16String = BitUtil.bytesToBase16(bytes)
  console.log('Serialized (base16):', base16String)
  const ub = BitUtil.base16ToBytes(base16String)
  console.log(ub)
  const deserialised = GetTransactionsRequest.deserializeBinary(ub)
  const { wallet, category, timestamp, order } = deserialised.toObject()
  console.log(wallet)
  console.log(category)
  console.log(timestamp)
  console.log(order)
}

const serialiseAndDeserialiseGetTransactionRequest = () => {
  const getTransactionRequest = new GetTransactionRequest()
  getTransactionRequest.setKey('session1234')
  getTransactionRequest.setWallet('eip155:1:0x69e666767Ba3a661369e1e2F572EdE7ADC926029')
  getTransactionRequest.setCategory(0)
  const bytes = getTransactionRequest.serializeBinary()
  console.log('Serialized (bytes):', bytes)
  const base16String = BitUtil.bytesToBase16(bytes)
  console.log('Serialized (base16):', base16String)
  const ub = BitUtil.base16ToBytes(base16String)
  console.log(ub)
  const deserialised = GetTransactionRequest.deserializeBinary(ub)
  const { key, wallet, category } = deserialised.toObject()
  console.log(key, wallet, category)
}

const serailiaseAndDeserialiseBlock = () => {
  const b = new Block()
  const to = new TransactionObj()
  const s1 = new Signer()
  s1.setNode('0x1111')
  s1.setRole(1)
  s1.setSig('CC')
  const s2 = new Signer()
  s2.setNode('0x2222')
  s2.setRole(1)
  s2.setSig('EE')
  b.setTs(DateUtil.currentTimeSeconds())
  b.setTxobjList([to])
  b.setAttesttoken('DD')
  b.setSignersList([s1, s2])
  b.setAttesttoken(BitUtil.base16ToBytes('C1CC'))
  console.log('block as json', JSON.stringify(b.toObject()))
  const blockAsBytes = b.serializeBinary()
  console.log('block as base16', BitUtil.bytesToBase16(blockAsBytes))
  const b2 = Block.deserializeBinary(blockAsBytes)
  console.log('block2 as json', JSON.stringify(b2.toObject()))
  // console.log("block hash", BitUtil.bytesToBase16(HashUtil.sha256AsBytes(blockAsBytes)));
}

serailiaseAndDeserialiseGetTransactionsRequest()
// serialiseAndDeserialiseGetTransactionRequest()
// serailiaseAndDeserialiseBlock()
