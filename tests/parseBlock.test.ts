import { expect } from 'chai'
import { Wallet } from 'ethers'

import { Block, Transaction } from '../src/generated/push/block_pb'
import { BlockUtil } from '../src/services/messaging-common/BlockUtil'
import { BitUtil } from '../src/utilz/bitUtil'
import { StrUtil } from '../src/utilz/strUtil'

type WalletInfo = {
  address: string
  publicKey: string
  privateKey: string
}

// test eth user private keys from hardhat (these are publicly known)
const USER_KEYS: WalletInfo[] = [
  {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    publicKey: null,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  },
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    publicKey: null,
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    publicKey: null,
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
  }
]

function getUserWallet(index: number): Wallet {
  return new Wallet(USER_KEYS[index].privateKey)
}

async function buildCustomTx1() {
  const data = BitUtil.base16ToBytes('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')

  const t = new Transaction()
  t.setType(0)
  t.setCategory('CUSTOM:EMAIL')
  t.setSender('eip155:1:' + getUserWallet(0).address)
  t.setRecipientsList([
    'eip155:1:' + getUserWallet(1).address,
    'eip155:1:' + getUserWallet(2).address
  ])
  t.setData(data)
  t.setSalt(BitUtil.base64ToBytes('cdYO7MAPTMisiYeEp+65jw=='))
  const apiToken =
    'VT1eyJub2RlcyI6W3sibm9kZUlkIjoiMHhmREFFYWY3YWZDRmJiNGU0ZDE2REM2NmJEMjAzOWZkNjAwNENGY2U4IiwidHNNaWxsaXMiOjE3Mjg2NzEyODAwMjMsInJhbmRvbUhleCI6ImFjM2YzNjg5ZGIyMDllYjhmNDViZWEzNDU5MjRkN2ZlYTZjMTlhNmMiLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3Mjg2NzEyNTAwMjEsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweDk4RjlEOTEwQWVmOUIzQjlBNDUxMzdhZjFDQTc2NzVlRDkwYTUzNTUiLCJ0c01pbGxpcyI6MTcyODY3MTI1MDAyMSwic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4MTA0ZmIwNTEzNTJiYTcxYjM4Zjk5M2ZhNDZiY2U2NGM2ZDMyYzBhZDRlZWYxZTgxODVjZjViMDRmYmVjOGM4YTRmMDhmYzg3MzBjZGI4NDcyMmZkYTIxMDU3MzRkOWU5MGNjMzlmZGE0ZjVkMTYxZjljOWFiNGEyMzIxM2RlZGExYyJ9LHsibm9kZUlkIjoiMHg5OEY5RDkxMEFlZjlCM0I5QTQ1MTM3YWYxQ0E3Njc1ZUQ5MGE1MzU1IiwidHNNaWxsaXMiOjE3Mjg2NzEyODAwMjAsInJhbmRvbUhleCI6Ijk5NTAyYmM4MWQyNWE2NjdlODlmYTZkNmY3ZDBjZmUxNzdmODkyZjMiLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3Mjg2NzEyNTAwMjIsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweGZEQUVhZjdhZkNGYmI0ZTRkMTZEQzY2YkQyMDM5ZmQ2MDA0Q0ZjZTgiLCJ0c01pbGxpcyI6MTcyODY3MTI1MDAyMSwic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4MmRiNjY4MTI5NGY0NGVhMzVmYWUxZGRhODhhMTIyZjk1NTBlNjg4MzIwZGY1MzU1MDJmNjQ1N2U2YmYyNmEwYzIzOGVjNDlkNTFhNGM3MTlmODhhYzEzMWFmOGIyZTcxOTdhOWY4MGQzMDAyYThkOTQ4YzM5YTU4NDgzNTYwYzQxYiJ9LHsibm9kZUlkIjoiMHg4ZTEyZEUxMkMzNWVBQmYzNWI1NmIwNEU1M0M0RTQ2OGU0NjcyN0U4IiwidHNNaWxsaXMiOjE3Mjg2NzEyODAwMjQsInJhbmRvbUhleCI6IjYzYWIxYWU4ZDk0MDNkY2I1NzM4NGZiNzE0NDQyYmIyMmI0NjYxN2UiLCJwaW5nUmVzdWx0cyI6W3sibm9kZUlkIjoiMHhmREFFYWY3YWZDRmJiNGU0ZDE2REM2NmJEMjAzOWZkNjAwNENGY2U4IiwidHNNaWxsaXMiOjE3Mjg2NzEyNTAwMjIsInN0YXR1cyI6MX0seyJub2RlSWQiOiIweDk4RjlEOTEwQWVmOUIzQjlBNDUxMzdhZjFDQTc2NzVlRDkwYTUzNTUiLCJ0c01pbGxpcyI6MTcyODY3MTI1MDAyMiwic3RhdHVzIjoxfV0sInNpZ25hdHVyZSI6IjB4M2Q3ZDAxMzdiNGE0MWNlNDczZTljZjBkNDkzZWE4OTM0YWFhZWIxYThiZGFlNzFlMWYyNTM1MDYxZDc2MjAxMTIyMDY5ZTYzOGU3ZTBkMmNiY2U1MmFiN2I3YzZlMTkwYzJlNWEzM2U1YTVkZjg0ZTJmY2ViZjllZDgwODlkMjgxYyJ9XX0='
  t.setApitoken(BitUtil.stringToBytesUtf(apiToken)) // fake token
  t.setFee('0')
  await BlockUtil.signTxEVM(t, getUserWallet(0))
  return t
}

describe('parsing tests', async function () {
  it('parse one random transaction', async function () {
    const hex =
      '1208494e49545f4449441a336569703135353a313a30786633394664366535316161643838463646346365366142383832373237396366664662393232363622336569703135353a313a30783730393937393730433531383132646333413031304337643031623530653064313764633739433822336569703135353a313a3078334334344364446442366139303066613262353835646432393965303364313246413432393342432a320a043078424210011a043078434322220a0430784141121a0a130a03717765120371617a2207707573683a76351203112233321071d60eecc00f4cc8ac898784a7eeb98f3a9f0f56543165794a756232526c6379493657337369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67324e7a45794f4441774d6a4d73496e4a68626d52766255686c65434936496d466a4d32597a4e6a67355a4749794d446c6c596a686d4e4456695a57457a4e4455354d6a526b4e325a6c59545a6a4d546c684e6d4d694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67324e7a45794e5441774d6a4573496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f4459334d5449314d4441794d537769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d5441305a6d49774e54457a4e544a6959546378596a4d345a6a6b354d325a684e445a69593255324e474d325a444d79597a42685a44526c5a5759785a5467784f44566a5a6a56694d44526d596d566a4f474d345954526d4d44686d597a67334d7a426a5a4749344e4463794d6d5a6b595449784d4455334d7a526b4f5755354d474e6a4d7a6c6d5a4745305a6a566b4d5459785a6a6c6a4f5746694e4745794d7a49784d32526c5a47457859794a394c487369626d396b5a556c6b496a6f694d4867354f45593552446b784d45466c5a6a6c434d304935515451314d544d3359575978513045334e6a63315a5551354d4745314d7a55314969776964484e4e6157787361584d694f6a45334d6a67324e7a45794f4441774d6a4173496e4a68626d52766255686c65434936496a6b354e544179596d4d344d5751794e5745324e6a646c4f446c6d59545a6b4e6d59335a44426a5a6d55784e7a646d4f446b795a6a4d694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67324e7a45794e5441774d6a4973496e4e3059585231637949364d58307365794a756232526c535751694f69497765475a45515556685a6a64685a6b4e47596d49305a54526b4d545a45517a5932596b51794d444d355a6d51324d44413051305a6a5a5467694c434a306330317062477870637949364d5463794f4459334d5449314d4441794d537769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d6d52694e6a59344d5449354e4759304e4756684d7a566d595755785a4752684f4468684d5449795a6a6b314e54426c4e6a67344d7a49775a4759314d7a55314d444a6d4e6a51314e325532596d59794e6d4577597a497a4f47566a4e446c6b4e5446684e474d334d546c6d4f446868597a457a4d57466d4f4749795a5463784f5464684f5759344d47517a4d4441795954686b4f545134597a4d35595455344e44677a4e545977597a517859694a394c487369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67324e7a45794f4441774d6a5173496e4a68626d52766255686c65434936496a597a59574978595755345a446b304d444e6b593249314e7a4d344e475a694e7a45304e445179596d49794d6d49304e6a59784e3255694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67324e7a45794e5441774d6a4973496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f4459334d5449314d4441794d697769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d3251335a4441784d7a64694e4745304d574e6c4e44637a5a546c6a5a6a426b4e446b7a5a5745344f544d30595746685a574978595468695a47466c4e7a466c4d5759794e544d314d4459785a4463324d6a41784d5449794d4459355a54597a4f4755335a54426b4d6d4e69593255314d6d46694e324933597a5a6c4d546b77597a4a6c4e57457a4d3255315954566b5a6a67305a544a6d593256695a6a6c6c5a4467774f446c6b4d6a677859794a395858303d42419d15e53d0e2c03f840553f65a6a09a44912213ff3145b4f5140e8ca8b6f643b7674379a22d64b2ced6b9acfa775fd1195c34b3d072e47a73077c9913a07809a51c4a0130'
    const tx = Transaction.deserializeBinary(BitUtil.base16ToBytes(hex))
    console.log('signed tx %o', tx.toObject())
    const check = await BlockUtil.checkTx(tx)
    console.log(check)
    // NOTE: this is okay to break ; if we will have ANY binary change
    expect(check.success).to.be.equal(true)
  })

  it('parse one random block', async function () {
    const hex =
      '088a83b1fea832229f0f41543165794a756232526c6379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774d7a5973496e4a68626d52766255686c65434936496a4d774d5445304d6a6c694e44457a4d6d49344d5467344d6d4a6c59544a68595746684e445a694d4751774d6d566b4d6a45324e324d694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e4441774f446b73496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f446b344f544d304d4441324f537769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d4441345a546b78595455335a6a6b78595755794d6d4d335a6d4a684e7a4e6b4f4455794d6d5933595441794e7a426a4d324e684d6d49354e324d315a6d5135596a4e6d4d4745774f446b355a6a686a5a5751334d4451794e474e6a5a4459324e4455334e54686d4d4759315a4745784d445a6b4d6a4133595445314d4759334f544934595441774e4441334e446b35597a6c6c5954526b4f5749794d7a597a597a4a694f4749784e7a637859794a394c487369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774e544973496e4a68626d52766255686c65434936496a5a6a4e54686b4f5749354d44566d5a5759345a544e6d4e6d51325a4451344e6d55794e7a6c694f5745324f4455774d324d334e6a63694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e4441774e6a4573496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f446b344f544d304d4441314e697769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d5451785957526d4f57497a4e3252684e6d4a6d4f574669593249774d54493259546b304e574a6b4e6d45775a544a695a4749314e6a55774d54466a4e5445775a6a426d5a4749784d444268596a566c4f544d304f4464695a4449794d6a63354d474d305a5445345a445934597a5131595459354e574e6c4e57566b596a526a595451334d4749304f444131596a67354d44686d4e7a63305a57566d4e7a49324d54466c4e6a67335a474d7859794a394c487369626d396b5a556c6b496a6f694d4867354f45593552446b784d45466c5a6a6c434d304935515451314d544d3359575978513045334e6a63315a5551354d4745314d7a55314969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774e6a4573496e4a68626d52766255686c65434936496a59305a574d334e7a6b7a5a44466a4f47526c4d5468694d54466b4f474d354d6d4d784e5749325a444d325a445669596a457a5a446b694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774d7a5173496e4e3059585231637949364d58307365794a756232526c535751694f69497765475a45515556685a6a64685a6b4e47596d49305a54526b4d545a45517a5932596b51794d444d355a6d51324d44413051305a6a5a5467694c434a306330317062477870637949364d5463794f446b344f544d334d4441314d437769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42345a54566b4e4452684d6a59305a6d497a595749305a546732597a4d795a4759795a5451314f446b354d6a5a695a4456684d6a4131595459325a6a426a4d6d517a595445354e44457a4d6d5934595756695a4755325a444a6b5957566d5a575978597a49324d4456694d7a49774d575a6b5a4751334f475130597a426d4f5451354d6a41354e4467344e4449314d545a695957557a4d5449774d5459334e6a5a6b4f44466a4e544d334d7a6b7859794a395858303d12b0120aa1121208494e49545f4449441a37707573683a6465766e65743a7075736831637a786a75707274746465393665386e746a6c746c68753637376d356a64736730667030337422336569703135353a313a30783335423834643638343844313634313531373763363444363435303436363362393938413661623422346569703135353a39373a3078443836333443333942424664343033336330643332383943343531353237353130323432333638312a780a0e6d61737465725f7075625f6b65791a0f646572697665645f7075625f6b657922550a37707573683a6465766e65743a7075736831786b757936367a6736396a7032396d75766e7479327072783877766335363435663979357578121a0a130a03717765120371617a2207707573683a7635120301020332100488e6448aea455f9bd685e2386117143a9f0f56543165794a756232526c6379493657337369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774e444973496e4a68626d52766255686c65434936496d5a68597a68684f544d785a474d304d47597a4e324d30596d4e6d59544a694d4451354d444d774f4749325957526b59544e69595751694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e4441774e6a4573496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f446b344f544d304d4441314e697769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344f4464684d54646d4f444d314e446332595449794f4455794e32497a596d49345a6a59784f44646a4e475977597a51304e5745354d6d526a4e4455305a6d526b4f47566d4d4467325a54557a5a5451774f5746685a54526b4f544d3059324e6a5a4449334d475a6a4e444d785954557a4e6d566c4e444a6c4d4752695a6d56685a6a557a4d4442694e7a45314d6a4d344e6a41324e7a42685a6d526b5a5463345a5467334d5755774e6a417859694a394c487369626d396b5a556c6b496a6f694d4867354f45593552446b784d45466c5a6a6c434d304935515451314d544d3359575978513045334e6a63315a5551354d4745314d7a55314969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774d7a5173496e4a68626d52766255686c65434936496a5177597a646c4e54466a4d7a686b4d6a5268596a49334d5445784e325a6b4f5756684d5449304d546b774e4467774d574534596a67694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e4441774e7a6b73496e4e3059585231637949364d58307365794a756232526c535751694f69497765475a45515556685a6a64685a6b4e47596d49305a54526b4d545a45517a5932596b51794d444d355a6d51324d44413051305a6a5a5467694c434a306330317062477870637949364d5463794f446b344f544d304d4441344f437769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344e6a6c6a4e32597a5a5445784d44526c596d59784d6a5531597a4d304d6a426b5a475268593245344e7a5a6b596a5a68596a49345932566d595449334e546b30597a566d4d575130596a4d355a546731597a517a5a6a526b4f5751794e7a6b774f5751324e4759785a4459334e4459304e47497a4d5745344e3252684f5749354e544e6d5a6a566b4e4755774e47466b597a5a6d4d4455314d7a59305a574a68595449344d7a59355954517859794a394c487369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774e544173496e4a68626d52766255686c65434936496a4d7a4e4751785a54466959545a6b4e7a5533595459774e7a6c6b4d324a684d6a4269595467344d6d597a5a54566c4e7a51324d5755694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774d7a6373496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f446b344f544d334d44417a4d437769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d7a6c6d5a6a4d335a4745324e7a526b4e474d334d54646a4e7a59354e54566c4d6a45334f4441305a6d5930595452695a446b335a6a6c6b4d44466a4e5759315a5755344e6a59794e4759794d325a694e57497a4f44426c4e324d794d54426a597a646a5a6a5a69596d59344d4463784d4451315a47466c4d546b78596a45355a4749304e32526959544934596a49314d546b304f546868597a4e6d4d474e694e5459324f574e6a4d6d457859794a395858303d424041863861637a97d94ab2fdb78aea7821a037e40b2cb62c0ac474790c92ff675558a9f0ab2edbdbb389100c4ca56724578ca296e5d8f36f8cc3621fd782a00a534a0130120208011a0208011a0208011a430a415f4164f72053d9a3e214fa018253e4c5cf3e91e4b9a715f0693a8b0404f2467768590cb40a5d80e75e43d6935f80217f43f5f17a809fadca7f0330af828b343e1b1a430a410fb7a01c3de228bae14fa0475106cb4a11119472e9d910c83cd17ef2b6632b540923c00cd8eb95198adea16c01ccd444b5bea6642d59a9dc699a0a56452dc8f71c1a430a418be571593d353019019fe2a17017b7669598a9ed134b052ac553cca0d96955d832fd6f3c027a44519108e8fd5b903461088697725fbb47076fe660b6ea8adb5a1b'
    const b = Block.deserializeBinary(BitUtil.base16ToBytes(hex))
    console.log('b %o', b.toObject())
  })
})

describe('normal tests', async function () {
  it.only('generate a transaction', async function () {
    const tx = await buildCustomTx1()
    console.log('signed tx %s bytes', BitUtil.bytesToBase16(tx.serializeBinary()))
    console.log('signed tx %o', tx.toObject())
    console.log('signed tx %s (compact print)', StrUtil.fmtProtoObj(tx))
    tx.getSalt_asB64()
    const check = await BlockUtil.checkTx(tx)
    console.log(check)
    // NOTE: this is okay to break ; if we will have ANY binary change
    expect(check.success).to.be.equal(true)
  })

  it('parse one random block', async function () {
    const hex =
      '088a83b1fea832229f0f41543165794a756232526c6379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774d7a5973496e4a68626d52766255686c65434936496a4d774d5445304d6a6c694e44457a4d6d49344d5467344d6d4a6c59544a68595746684e445a694d4751774d6d566b4d6a45324e324d694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e4441774f446b73496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f446b344f544d304d4441324f537769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d4441345a546b78595455335a6a6b78595755794d6d4d335a6d4a684e7a4e6b4f4455794d6d5933595441794e7a426a4d324e684d6d49354e324d315a6d5135596a4e6d4d4745774f446b355a6a686a5a5751334d4451794e474e6a5a4459324e4455334e54686d4d4759315a4745784d445a6b4d6a4133595445314d4759334f544934595441774e4441334e446b35597a6c6c5954526b4f5749794d7a597a597a4a694f4749784e7a637859794a394c487369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774e544973496e4a68626d52766255686c65434936496a5a6a4e54686b4f5749354d44566d5a5759345a544e6d4e6d51325a4451344e6d55794e7a6c694f5745324f4455774d324d334e6a63694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e4441774e6a4573496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f446b344f544d304d4441314e697769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d5451785957526d4f57497a4e3252684e6d4a6d4f574669593249774d54493259546b304e574a6b4e6d45775a544a695a4749314e6a55774d54466a4e5445775a6a426d5a4749784d444268596a566c4f544d304f4464695a4449794d6a63354d474d305a5445345a445934597a5131595459354e574e6c4e57566b596a526a595451334d4749304f444131596a67354d44686d4e7a63305a57566d4e7a49324d54466c4e6a67335a474d7859794a394c487369626d396b5a556c6b496a6f694d4867354f45593552446b784d45466c5a6a6c434d304935515451314d544d3359575978513045334e6a63315a5551354d4745314d7a55314969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774e6a4573496e4a68626d52766255686c65434936496a59305a574d334e7a6b7a5a44466a4f47526c4d5468694d54466b4f474d354d6d4d784e5749325a444d325a445669596a457a5a446b694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774d7a5173496e4e3059585231637949364d58307365794a756232526c535751694f69497765475a45515556685a6a64685a6b4e47596d49305a54526b4d545a45517a5932596b51794d444d355a6d51324d44413051305a6a5a5467694c434a306330317062477870637949364d5463794f446b344f544d334d4441314d437769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42345a54566b4e4452684d6a59305a6d497a595749305a546732597a4d795a4759795a5451314f446b354d6a5a695a4456684d6a4131595459325a6a426a4d6d517a595445354e44457a4d6d5934595756695a4755325a444a6b5957566d5a575978597a49324d4456694d7a49774d575a6b5a4751334f475130597a426d4f5451354d6a41354e4467344e4449314d545a695957557a4d5449774d5459334e6a5a6b4f44466a4e544d334d7a6b7859794a395858303d12b0120aa1121208494e49545f4449441a37707573683a6465766e65743a7075736831637a786a75707274746465393665386e746a6c746c68753637376d356a64736730667030337422336569703135353a313a30783335423834643638343844313634313531373763363444363435303436363362393938413661623422346569703135353a39373a3078443836333443333942424664343033336330643332383943343531353237353130323432333638312a780a0e6d61737465725f7075625f6b65791a0f646572697665645f7075625f6b657922550a37707573683a6465766e65743a7075736831786b757936367a6736396a7032396d75766e7479327072783877766335363435663979357578121a0a130a03717765120371617a2207707573683a7635120301020332100488e6448aea455f9bd685e2386117143a9f0f56543165794a756232526c6379493657337369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774e444973496e4a68626d52766255686c65434936496d5a68597a68684f544d785a474d304d47597a4e324d30596d4e6d59544a694d4451354d444d774f4749325957526b59544e69595751694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e4441774e6a4573496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f446b344f544d304d4441314e697769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344f4464684d54646d4f444d314e446332595449794f4455794e32497a596d49345a6a59784f44646a4e475977597a51304e5745354d6d526a4e4455305a6d526b4f47566d4d4467325a54557a5a5451774f5746685a54526b4f544d3059324e6a5a4449334d475a6a4e444d785954557a4e6d566c4e444a6c4d4752695a6d56685a6a557a4d4442694e7a45314d6a4d344e6a41324e7a42685a6d526b5a5463345a5467334d5755774e6a417859694a394c487369626d396b5a556c6b496a6f694d4867354f45593552446b784d45466c5a6a6c434d304935515451314d544d3359575978513045334e6a63315a5551354d4745314d7a55314969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774d7a5173496e4a68626d52766255686c65434936496a5177597a646c4e54466a4d7a686b4d6a5268596a49334d5445784e325a6b4f5756684d5449304d546b774e4467774d574534596a67694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e4441774e7a6b73496e4e3059585231637949364d58307365794a756232526c535751694f69497765475a45515556685a6a64685a6b4e47596d49305a54526b4d545a45517a5932596b51794d444d355a6d51324d44413051305a6a5a5467694c434a306330317062477870637949364d5463794f446b344f544d304d4441344f437769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344e6a6c6a4e32597a5a5445784d44526c596d59784d6a5531597a4d304d6a426b5a475268593245344e7a5a6b596a5a68596a49345932566d595449334e546b30597a566d4d575130596a4d355a546731597a517a5a6a526b4f5751794e7a6b774f5751324e4759785a4459334e4459304e47497a4d5745344e3252684f5749354e544e6d5a6a566b4e4755774e47466b597a5a6d4d4455314d7a59305a574a68595449344d7a59355954517859794a394c487369626d396b5a556c6b496a6f694d4867345a5445795a4555784d6b4d7a4e575642516d597a4e5749314e6d49774e4555314d304d30525451324f4755304e6a63794e3055344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774e544173496e4a68626d52766255686c65434936496a4d7a4e4751785a54466959545a6b4e7a5533595459774e7a6c6b4d324a684d6a4269595467344d6d597a5a54566c4e7a51324d5755694c434a776157356e556d567a645778306379493657337369626d396b5a556c6b496a6f694d48686d524546465957593359575a44526d4a694e4755305a44453252454d324e6d4a454d6a417a4f575a6b4e6a41774e454e47593255344969776964484e4e6157787361584d694f6a45334d6a67354f446b7a4e7a41774d7a6373496e4e3059585231637949364d58307365794a756232526c535751694f69497765446b34526a6c454f5445775157566d4f55497a516a6c424e4455784d7a64685a6a4644515463324e7a566c52446b775954557a4e5455694c434a306330317062477870637949364d5463794f446b344f544d334d44417a4d437769633352686448567a496a6f7866563073496e4e705a323568644856795a534936496a42344d7a6c6d5a6a4d335a4745324e7a526b4e474d334d54646a4e7a59354e54566c4d6a45334f4441305a6d5930595452695a446b335a6a6c6b4d44466a4e5759315a5755344e6a59794e4759794d325a694e57497a4f44426c4e324d794d54426a597a646a5a6a5a69596d59344d4463784d4451315a47466c4d546b78596a45355a4749304e32526959544934596a49314d546b304f546868597a4e6d4d474e694e5459324f574e6a4d6d457859794a395858303d424041863861637a97d94ab2fdb78aea7821a037e40b2cb62c0ac474790c92ff675558a9f0ab2edbdbb389100c4ca56724578ca296e5d8f36f8cc3621fd782a00a534a0130120208011a0208011a0208011a430a415f4164f72053d9a3e214fa018253e4c5cf3e91e4b9a715f0693a8b0404f2467768590cb40a5d80e75e43d6935f80217f43f5f17a809fadca7f0330af828b343e1b1a430a410fb7a01c3de228bae14fa0475106cb4a11119472e9d910c83cd17ef2b6632b540923c00cd8eb95198adea16c01ccd444b5bea6642d59a9dc699a0a56452dc8f71c1a430a418be571593d353019019fe2a17017b7669598a9ed134b052ac553cca0d96955d832fd6f3c027a44519108e8fd5b903461088697725fbb47076fe660b6ea8adb5a1b'
    const b = Block.deserializeBinary(BitUtil.base16ToBytes(hex))
    console.log('b %o', b.toObject())
  })
})
