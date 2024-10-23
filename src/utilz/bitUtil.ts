import {Coll} from './coll';
// @ts-ignore
import bs58 from 'bs58';
import {Check} from "./check";

// bytes      (as hex numbers)            = 0x41 0x41 0x42 0x42
// Uint8Array (as decimal numbers)        = 65 65 66 66
//        string (as non printable chars) = ..
// base16 string                          = 0xAABB
// base64 string                          = QUFCQg==

export class BitUtil {
  /**
   * XORs 2 buffers, byte by byte: src = src XOR add
   * 1 modifies src
   * 2 returns srs || src's resized copy in case there is no room for add bytes
   *
   * @param src
   * @param add
   */
  public static xor(src: Buffer, add: Buffer): Buffer {
    if (src == null && add == null) {
      return Buffer.alloc(0)
    } else if (add == null) {
      return src
    } else if (src == null) {
      src = new Buffer(add.length)
      add.copy(src, 0, 0, add.length)
      return src
    }
    let target = src
    if (add.length > src.length) {
      target = new Buffer(add.length)
      src.copy(target, 0, 0, src.length)
    }
    var length = Math.min(target.length, add.length)
    for (var i = 0; i < length; ++i) {
      target[i] = target[i] ^ add[i]
    }
    return target
  }

  public static strToBase64(value: string): string {
    return Buffer.from(value).toString('base64')
  }

  public static base64ToStr(value: string): string {
    return Buffer.from(value, 'base64').toString('utf8')
  }

  public static getBit(number: number, bitOffset: number) {
    return (number & (1 << bitOffset)) === 0 ? 0 : 1
  }

  public static bitsToPositions(number: number): number[] {
    // return null;
    const result: number[] = []
    let position = 0
    while (number !== 0) {
      if ((number & 1) === 1) {
        result.push(position)
      }
      number = number >>> 1
      position++
    }
    Coll.sortNumbersAsc(result)
    return result
  }


  public static base16ToBytes(base16String: string): Uint8Array {
    const result = Uint8Array.from(Buffer.from(base16String, 'hex'));
    const conversionHadNoErrors = base16String.length == 0 || result.length == base16String.length / 2;
    Check.isTrue(conversionHadNoErrors, 'failed to convert hex string ' + base16String);
    return result;
  }

  public static bytesToBase16(arr: Uint8Array): string {
    return Buffer.from(arr).toString('hex');
  }

  public static bytesBufToBase16(buf: Buffer): string {
    return buf.toString('hex');
  }

  public static base64ToString(base64String: string): string {
    return Buffer.from(base64String, 'base64').toString('utf8');
  }

  public static bytesToBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64');
  }

  public static base64ToBytes(base64String: string): Uint8Array {
    return new Uint8Array(Buffer.from(base64String, 'base64'));
  }

  public static bytesUtfToString(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('utf8');
  }

  public static stringToBytesUtf(str: string): Uint8Array {
    return new Uint8Array(Buffer.from(str, 'utf-8'));
  }

  public static stringToBase64(str: string): string {
    return Buffer.from(str, 'utf-8').toString('base64');
  }

  public static base64ToBase16(base64String: string): string {
    return Buffer.from(base64String, 'base64').toString('hex');
  }

  public static base58ToBytes(base58String: string): Uint8Array {
    return bs58.decode(base58String);
  }

  public static bytesToBase58(bytes: Uint8Array): string {
    return bs58.encode(bytes);
  }

  static asciis = {_0: 48, _9: 57, _A: 65, _F: 70, _a: 97, _f: 102} as const;

  public static asciiToBase16(char: number): number | undefined {
    const a = this.asciis;
    if (char >= a._0 && char <= a._9) return char - a._0;
    if (char >= a._A && char <= a._F) return char - (a._A - 10);
    if (char >= a._a && char <= a._f) return char - (a._a - 10);
    return;
  }

  public static hex0xToBytes(hexString: string): Uint8Array {
    hexString = this.hex0xRemove(hexString);
    const result = this.base16ToBytes(hexString);
    // there is no way to check for illegal characters without iterating over each char
    // and Buffer silently ignores invalid chars
    // so we will simply compare the output length; it should be 1 byte per 2 chars of input!
    const conversionHadNoErrors = result.length == hexString.length / 2;
    Check.isTrue(hexString.length == 0 || conversionHadNoErrors, 'hex string contains invalid chars');
    return result;
  }

  public static hex0xRemove(hexString: string) {
    Check.notNull(hexString, 'hex string is null');
    Check.isTrue(typeof hexString === 'string', 'string is expected');
    if (hexString.length >= 2 && (hexString.startsWith('0x') || hexString.startsWith('0X'))) {
      hexString = hexString.substring(2);
    }
    if (hexString.length % 2 == 1) {
      hexString = '0' + hexString;
    }
    return hexString.toLowerCase();
  }

  public static hex0xAppend(hexString: string) {
    Check.notNull(hexString, 'hex string is null');
    Check.isTrue(typeof hexString === 'string', 'string is expected');
    if (hexString.length >= 2 && (hexString.startsWith('0x') || hexString.startsWith('0X'))) {
      return hexString;
    }
    return '0x' + hexString;
  }

}
