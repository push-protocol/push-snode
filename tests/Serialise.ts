import { GetTransactionsRequest } from '../src/generated/push/v1/snode_pb'

const serailiaseAndDeserialise = () => {
  const getTransactionsRequest = new GetTransactionsRequest()
  getTransactionsRequest.setWallet('eip155:1:0x69e666767Ba3a661369e1e2F572EdE7ADC926029')
  getTransactionsRequest.setCategory(0)
  getTransactionsRequest.setSortkey('sortkey')
  getTransactionsRequest.setOrder(0)
  const bytes = getTransactionsRequest.serializeBinary()
  console.log('Serialized (bytes):', bytes)
  const base64String = Buffer.from(bytes).toString('base64')
  console.log('Serialized (base64):', base64String)
  const ub = new Uint8Array(Buffer.from(base64String, 'base64'))
  console.log(ub)
  const deserialised = GetTransactionsRequest.deserializeBinary(ub)
  const { wallet, category, sortkey, order } = deserialised.toObject()
  console.log(wallet)
  console.log(category)
  console.log(sortkey)
  console.log(order)
}

serailiaseAndDeserialise()
