import {StrUtil} from './strUtil'
import {Check} from "./check";
import {BitUtil} from "./bitUtil";

export class ChainUtil {

  static readonly ADDR_MAX = 65;
  static readonly NAMESPACE_MAX = 8;
  static readonly CHAINID_MAX = 32;


  /**
   * caip10 spec https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
   *
   * @param addressinCAIP or error message
   */
  public static parseCaipAddress(addressinCAIP: string): Tuple<CaipAddr, string> {
    if (StrUtil.isEmpty(addressinCAIP) || addressinCAIP.trim() === '') {
      return [null, 'Address is empty'];
    }

    const addressComponents = addressinCAIP.split(':');
    let namespace: string;
    let chainId: string = null;
    let addr: string;

    if (addressComponents.length === 3) {
      [namespace, chainId, addr] = addressComponents;
    } else if (addressComponents.length === 2) {
      [namespace, addr] = addressComponents;
    } else {
      return [null, 'Invalid CAIP address format'];
    }

    if (!StrUtil.hasSize(namespace, 1, this.NAMESPACE_MAX)) {
      return [null, `Invalid namespace value: ${namespace}`];
    }
    if (addressComponents.length == 3 && !StrUtil.hasSize(chainId, 1, this.CHAINID_MAX)) {
      return [null, `Invalid chainId value: ${chainId}`];
    }

    let addrNoPrefix = addr.startsWith('0x') ? addr.substring(2) : addr;
    if (!StrUtil.hasSize(addrNoPrefix, 4, this.ADDR_MAX)) {
      return [null, `Invalid address value: ${addr}`];
    }

    return [{namespace, chainId, addr}, null];
  }


  /*
  Valid addresses:
  eip155:5:0xAAAAAA
  e:1:0
   */
  public static isFullCAIPAddress(fullCaipAddress: string): boolean {
    let [caip, err] = ChainUtil.parseCaipAddress(fullCaipAddress);
    if (err != null) {
      return false;
    }
    let valid = !StrUtil.isEmpty(caip.chainId)
      && !StrUtil.isEmpty(caip.namespace)
      && !StrUtil.isEmpty(caip.addr);
    return valid;
  }


  public static generateRandomAddresses(sample: string[], K: number): string[] {
    // Extract unique chain IDs from the sample
    const chainIds = ChainUtil.extractChainIds(sample);
    const addresses: string[] = [];

    for (let i = 0; i < K; i++) {
      // Randomly select a chain ID
      const chainId = chainIds[Math.floor(Math.random() * chainIds.length)];
      // Generate a random address for the selected chain
      const address = ChainUtil.generateRandomAddressForChain(chainId);
      if (address) {
        const caip10Address = `${chainId}:${address}`;
        Check.isTrue(ChainUtil.isFullCAIPAddress(caip10Address), 'invalid caip10 address generated');
        addresses.push(caip10Address);
      } else {
        // If address generation failed, retry this iteration
        i--;
      }
    }

    // Shuffle the resulting addresses to ensure random order
    for (let i = addresses.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [addresses[i], addresses[j]] = [addresses[j], addresses[i]];
    }

    return addresses;
  }


  static extractChainIds(addresses: string[]): string[] {
    const chainIds = new Set<string>();
    for (const addr of addresses) {
      const parts = addr.split(':');
      if (parts.length >= 3) {
        const chainNamespace = parts[0];
        const chainReference = parts[1];
        const chainId = `${chainNamespace}:${chainReference}`;
        chainIds.add(chainId);
      }
    }
    return Array.from(chainIds);
  }

  static generateRandomAddressForChain(chainId: string): string | null {
    if (chainId.startsWith('eip155:')) {
      return ChainUtil.generateRandomEthereumAddress();
    } else if (chainId.startsWith('bip122:')) {
      return ChainUtil.generateRandomBitcoinAddress();
    } else if (chainId.startsWith('cosmos:')) {
      return ChainUtil.generateRandomCosmosAddress();
    } else if (chainId.startsWith('polkadot:')) {
      return ChainUtil.generateRandomPolkadotAddress();
    } else if (chainId.startsWith('starknet:')) {
      return ChainUtil.generateRandomStarknetAddress();
    } else if (chainId.startsWith('hedera:')) {
      return ChainUtil.generateRandomHederaAddress();
    } else {
      // Unsupported chain
      return null;
    }
  }

  static generateRandomEthereumAddress(): string {
    // Ethereum addresses are 20 bytes (40 hex chars) prefixed with '0x'
    const addressLength = 20; // bytes
    let address = '0x';
    for (let i = 0; i < addressLength * 2; i++) {
      address += Math.floor(Math.random() * 16).toString(16);
    }
    return address;
  }

  static generateRandomBitcoinAddress(): string {
    // Bitcoin addresses are base58, starting with '1' or '3'
    const prefixes = ['1', '3'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const length = 26 + Math.floor(Math.random() * 10); // 26-35 characters
    const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = prefix;
    for (let i = 1; i < length; i++) {
      address += base58Chars.charAt(Math.floor(Math.random() * base58Chars.length));
    }
    return address;
  }

  static generateRandomCosmosAddress(): string {
    // Cosmos addresses are bech32, starting with 'cosmos1'
    const bech32Chars = '023456789acdefghjklmnpqrstuvwxyz';
    let address = 'cosmos1';
    for (let i = 0; i < 38; i++) {
      address += bech32Chars.charAt(Math.floor(Math.random() * bech32Chars.length));
    }
    return address;
  }

  static generateRandomPolkadotAddress(): string {
    // Polkadot addresses are base58, typically 47 characters long
    const prefixes = ['1', '5'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const length = 47;
    const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = prefix;
    for (let i = 1; i < length; i++) {
      address += base58Chars.charAt(Math.floor(Math.random() * base58Chars.length));
    }
    return address;
  }

  static generateRandomStarknetAddress(): string {
    // Starknet addresses are 251 bits, we'll generate 64 hex digits
    const addressLength = 64; // hex digits
    let address = '0x';
    for (let i = 0; i < addressLength; i++) {
      address += Math.floor(Math.random() * 16).toString(16);
    }
    return address;
  }

  static generateRandomHederaAddress(): string {
    // Hedera addresses are in the format '0.0.x'
    const accountNum = Math.floor(Math.random() * 1e9);
    return `0.0.${accountNum}`;
  }

  // suports null values
  // ignores case
  public static isEqualEvmAddress(addr1: string, addr2: string): boolean {
    if (addr1 === addr2) {
      return true;
    }
    if (addr1 != null && addr2 == null || addr1 == null && addr2 != null) {
      return false;
    }
    let addr1Fix = addr1 == null ? '' : BitUtil.hex0xRemove(addr1).toUpperCase();
    let addr2Fix = addr2 == null ? '' : BitUtil.hex0xRemove(addr2).toUpperCase();
    return addr1Fix === addr2Fix;
  }

}

// ex: eip155:5:0xD8634C39BBFd4033c0d3289C4515275102423681
export class CaipAddr {
  // ex: eip155
  namespace: string;
  // ex: 5
  chainId: string | null;
  // ex: 0xD8634C39BBFd4033c0d3289C4515275102423681
  addr: string;
}



