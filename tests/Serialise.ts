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
    'VT1eyJub2RlcyI6W3sibm9kZUlkIjoiMHhmREFFYWY3YWZDRmJiNGU0ZDE2REM2NmJEMjAzOWZkNjAwNENGY2U4IiwidHNNaWxsaXMiOjE3Mjg5NzkwODAwNjUsInJhbmRvbUhleCI6ImY1MjhiZTA1OTgyNjNlZDBlYzZkNjcxOTI4NWMzNmI0OTVjY2QyMjkiLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3Mjg5NzkwNTAwNTMsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweDk4RjlEOTEwQWVmOUIzQjlBNDUxMzdhZjFDQTc2NzVlRDkwYTUzNTUiLCJ0c01pbGxpcyI6MTcyODk3OTA1MDA1NSwic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4YjZkNGQ3OGQ3YjVmM2NmYjdjNTRlMjg3YWFjN2RmNzdhMGYyOTNjOTYxZDdkZTNiODhmNTc5ZDBiZTc3NWM4OTJlOGEyMWE4NGQ4MTE0NzQ4MWJmZmRhOWZkYzc3NTI3ZjEzYjg1Mjg5ZDdiNDNmODI4MDYyZjQ4Y2M2Y2MzMzExYyJ9LHsibm9kZUlkIjoiMHg5OEY5RDkxMEFlZjlCM0I5QTQ1MTM3YWYxQ0E3Njc1ZUQ5MGE1MzU1IiwidHNNaWxsaXMiOjE3Mjg5NzkwODAwNjIsInJhbmRvbUhleCI6IjhjMDdmZmY1OTk5Yzk2MGIxN2I1MmM3YjliODdlOGE3MTQwMWE2YmIiLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3Mjg5NzkwNTAwNDEsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweGZEQUVhZjdhZkNGYmI0ZTRkMTZEQzY2YkQyMDM5ZmQ2MDA0Q0ZjZTgiLCJ0c01pbGxpcyI6MTcyODk3OTA1MDA0NCwic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4YjE0Njk2NzAyZjRjM2IwZDEyZWE1ZmY4MjZmYWJiZjlmYWI1ZjQxNWFiYjYwNjlkMDAxZDhmMWQyYTg3NzY4MTZhZjhhYTMwODUyODFjZDA5MTlkMzZiOGY5YjE3ZTViNjkyOTVkNmI1NDA0MmUxMDk2Y2FmYjRmNTMzODMyMjQxYyJ9LHsibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3Mjg5NzkwODAwNzIsInJhbmRvbUhleCI6ImU5ODRmNjY2NWJhNThlNTJjNWFiMThlZTM0YjJjMzJiZTljYTU5N2UiLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHhmREFFYWY3YWZDRmJiNGU0ZDE2REM2NmJEMjAzOWZkNjAwNENGY2U4IiwidHNNaWxsaXMiOjE3Mjg5NzkwODAwNjEsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweDk4RjlEOTEwQWVmOUIzQjlBNDUxMzdhZjFDQTc2NzVlRDkwYTUzNTUiLCJ0c01pbGxpcyI6MTcyODk3OTA4MDA1OCwic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4NDI2YmVhZjU1NTY5NjFjMmUzOGY4ZDdhNDQxYjg5OGI0ODRlNDc4NWY1ZjNhNzIyMjllOTA3Mzk3ZWMxOTE3NzJlYzQ4MjlhMmI3ZThlODlmNGU3NTJiN2RiOTM0MzI4OWJkNmMwYjhhM2FlM2Y5ZDcyY2E2MzFiYjYxY2ZhNWYxYiJ9XX0='
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
  const deserializedInitDid = InitDid.deserializeBinary(trxDataBinary as Uint8Array)
  console.log('Deserialized InitDid', deserializedInitDid)
  console.log('Deserialized InitDid as JSON', deserializedInitDid.toObject())
}

serialiseAndDeserialiseData()
