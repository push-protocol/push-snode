import {
  EncryptedText,
  InitDid,
  Transaction,
  WalletToEncDerivedKey
} from '../src/generated/push/v1/block_pb'
import { BitUtil } from '../src/utilz/bitUtil'
// import DateUtil from '../src/utilz/dateUtil'
import { HashUtil } from '../src/utilz/hashUtil'
import IdUtil from '../src/utilz/idUtil'

const serialiseAndDeserialiseData = () => {
  console.log('building ------------------------- ')

  // build encrypted text
  const encryptedText = new EncryptedText()
  encryptedText.setCiphertext('qwe')
  encryptedText.setSalt('qaz')
  encryptedText.setNonce('')
  encryptedText.setVersion('push:v5')
  encryptedText.setPrekey('')

  // build WalletToEncDerivedKey
  const walletToEncDerivedKey = new WalletToEncDerivedKey()
  walletToEncDerivedKey.setEncderivedprivkey(encryptedText)
  walletToEncDerivedKey.setSignature(new Uint8Array([1, 2, 3]))

  // build InitDid and set the map
  const data = new InitDid()
  data.setMasterpubkey('0xBB')
  data.setDerivedkeyindex(1)
  data.setDerivedpubkey('0xCC')
  data.getWallettoencderivedkeyMap().set('0xAA', walletToEncDerivedKey)
  data.getWallettoencderivedkeyMap().set('0xDD', walletToEncDerivedKey)
  console.log(data)
  console.log('data as json', JSON.stringify(data.toObject()))

  // build transaction
  const t = new Transaction()
  t.setType(0)
  t.setCategory('INIT_DID')
  t.setSender('eip155:1:0xAA')
  t.setRecipientsList(['eip155:1:0xBB', 'eip155:1:0xCC'])
  t.setData(data.serializeBinary()) // Serializing InitDid to binary and setting it in the transaction
  t.setSalt(IdUtil.getUuidV4AsBytes())
  const token =
    'eyJub2RlcyI6W3sibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3MjQ2NzMyNDAwMzAsInJhbmRvbUhleCI6ImY3YmY3YmYwM2ZlYTBhNzI1MTU2OWUwNWRlNjU2ODJkYjU1OTU1N2UiLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHhmREFFYWY3YWZDRmJiNGU0ZDE2REM2NmJEMjAzOWZkNjAwNENGY2U4IiwidHNNaWxsaXMiOjE3MjQ2NzMyNDAwMjAsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweDk4RjlEOTEwQWVmOUIzQjlBNDUxMzdhZjFDQTc2NzVlRDkwYTUzNTUiLCJ0c01pbGxpcyI6MTcyNDY3MzI0MDAxOSwic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4YjMzM2NjMWI3MWM0NGM0MDhkOTZiN2JmYjYzODU0OTNjZjE2N2NiMmJkMjU1MjdkNzg2ZDM4ZjdiOTgwZWFkMzAxMmY3NmNhNzhlM2FiMWEzN2U2YTFjY2ZkMjBiNjkzZGVmZDAwOWM4NzExY2ZjODlmMDUyYjM5MzY4ZjFjZTgxYiJ9LHsibm9kZUlkIjoiMHhmREFFYWY3YWZDRmJiNGU0ZDE2REM2NmJEMjAzOWZkNjAwNENGY2U4IiwidHNNaWxsaXMiOjE3MjQ2NzMyNDAwMjUsInJhbmRvbUhleCI6IjkyMTY4NzRkZjBlMTQ4NTk3ZjlkNDRkMGRmZmFlZGU5NTg0NGRkMTciLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3MjQ2NzMyMjQ2NTAsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweDk4RjlEOTEwQWVmOUIzQjlBNDUxMzdhZjFDQTc2NzVlRDkwYTUzNTUiLCJ0c01pbGxpcyI6MTcyNDY3MzIyNDY1NSwic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4N2JmYzQ0MjQ0ZGM0MTdhMjg0YzEwODUwZGEzNTE2YzUwNWEwNjJmYjIyYmI1ODU0ODg2YWEyOTk3OWUwMmYxOTdlZWMyYzk2ZDVkOTQ4ZDBhMWQ2NTBlYzIzNGRhMDVjMGY5M2JlNWUyMDkxNjFlYzJjY2JjMWU5YzllNzQyOGIxYiJ9LHsibm9kZUlkIjoiMHg5OEY5RDkxMEFlZjlCM0I5QTQ1MTM3YWYxQ0E3Njc1ZUQ5MGE1MzU1IiwidHNNaWxsaXMiOjE3MjQ2NzMyNDAwMjQsInJhbmRvbUhleCI6IjBkOWExNmE4OTljYWQwZWZjODgzZjM0NWQwZjgwYjdmYTE1YTY1NmYiLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3MjQ2NzMyMjY5NDMsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweGZEQUVhZjdhZkNGYmI0ZTRkMTZEQzY2YkQyMDM5ZmQ2MDA0Q0ZjZTgiLCJ0c01pbGxpcyI6MTcyNDY3MzIyNjk0Nywic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4YmE2Mjk2OTZlZWU4MDQ4ZDE2OTA3MDNhZmVjYWY4ZmJjM2Y4NDMxOWQ0OTFhZGIzY2YzZGYzMzExMTllMDAyOTA1MTc3MjAyNzkxNzEzNTMzMmU0MGZiMzI2OTM5Y2JhN2Y2NDc2NmYyYjY5MzQwZTZlNGYwZmIzNjM2OThmYzkxYiJ9XX0='
  t.setApitoken(BitUtil.base64ToBytes(token)) // fake token

  t.setFee('1') // tbd
  t.setSignature(BitUtil.base16ToBytes('EE')) // fake signature
  console.log('-'.repeat(40))
  console.log('tx as json', JSON.stringify(t.toObject()))

  // Serialize the transaction
  const txAsBytes = t.serializeBinary()
  console.log('tx as bytes', txAsBytes)
  console.log('tx as base16', BitUtil.bytesToBase16(txAsBytes))
  console.log('tx hash', BitUtil.bytesToBase16(HashUtil.sha256AsBytes(txAsBytes)))

  // Deserialize the transaction
  const transactionDeserialised = Transaction.deserializeBinary(txAsBytes)
  console.log('tx deserialised', transactionDeserialised)

  // Extract data field (binary) from the deserialized transaction
  const trxDataBinary = transactionDeserialised.getData()
  console.log('tx data (binary)', trxDataBinary)

  // Deserialize the data field back into an InitDid object
  const deserializedInitDid = InitDid.deserializeBinary(trxDataBinary)
  console.log('Deserialized InitDid', deserializedInitDid)
  console.log('Deserialized InitDid as JSON', deserializedInitDid.toObject())
}

serialiseAndDeserialiseData()
