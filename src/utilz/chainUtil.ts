import StrUtil from './strUtil'

export class ChainUtil {
  static readonly ADDR_MAX = 64
  static readonly NAMESPACE_MAX = 8
  static readonly CHAINID_MAX = 32

  /**
   * caip10 spec https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
   *
   * @param addressinCAIP or error message
   */
  public static parseCaipAddress(addressinCAIP: string): Tuple<CaipAddr, string> {
    if (StrUtil.isEmpty(addressinCAIP) || addressinCAIP.trim() === '') {
      return [null, 'Address is empty']
    }

    const addressComponents = addressinCAIP.split(':')
    let namespace: string
    let chainId: string = null
    let addr: string

    if (addressComponents.length === 3) {
      ;[namespace, chainId, addr] = addressComponents
    } else if (addressComponents.length === 2) {
      ;[namespace, addr] = addressComponents
    } else {
      return [null, 'Invalid CAIP address format']
    }

    if (!StrUtil.hasSize(namespace, 1, this.NAMESPACE_MAX)) {
      return [null, `Invalid namespace value: ${namespace}`]
    }
    if (addressComponents.length == 3 && !StrUtil.hasSize(chainId, 1, this.CHAINID_MAX)) {
      return [null, `Invalid chainId value: ${chainId}`]
    }

    const addrNoPrefix = addr.startsWith('0x') ? addr.substring(2) : addr
    if (!StrUtil.hasSize(addrNoPrefix, 4, this.ADDR_MAX)) {
      return [null, `Invalid address value: ${addr}`]
    }

    return [{ namespace, chainId, addr }, null]
  }

  /*
  Valid addresses:
  eip155:5:0xAAAAAA
  e:1:0
   */
  public static isFullCAIPAddress(fullCaipAddress: string): boolean {
    const [caip, err] = ChainUtil.parseCaipAddress(fullCaipAddress)
    if (err != null) {
      return false
    }
    const valid =
      !StrUtil.isEmpty(caip.chainId) &&
      !StrUtil.isEmpty(caip.namespace) &&
      !StrUtil.isEmpty(caip.addr)
    return valid
  }
}

// ex: eip155:5:0xD8634C39BBFd4033c0d3289C4515275102423681
export class CaipAddr {
  // ex: eip155
  namespace: string
  // ex: 5
  chainId: string | null
  // ex: 0xD8634C39BBFd4033c0d3289C4515275102423681
  addr: string
}
