export default class StrUtil {

  public static isEmpty(s: string): boolean {
    if (s == null) {
      return true;
    }
    if (typeof s !== 'string') {
      return false;
    }
    return s.length === 0
  }

  public static isHex(s: string): boolean {
    if (StrUtil.isEmpty(s)) {
      return false;
    }
    let pattern = /^[A-F0-9]+$/i;
    let result = pattern.test(s);
    return result;
  }

  /**
   * Return s if this is not empty, defaultValue otherwise
   * @param s
   * @param defaultValue
   */
  public static getOrDefault(s: string, defaultValue: string) {
    return StrUtil.isEmpty(s) ? defaultValue : s;
  }

  public static toStringDeep(obj: any): string {
    return JSON.stringify(obj, null, 4);
  }

  // https://ethereum.stackexchange.com/questions/2045/is-ethereum-wallet-address-case-sensitive
  public static normalizeEthAddress(addr: string): string {
    return addr;
  }

  public static replaceAll(str: string,
                             find: string[], replace: string[],
                             regexFlags: string):string {
    var gFlag = false

    if (typeof str !== 'string') {
      throw new TypeError('`str` parameter must be a string!')
    }

    if (!Array.isArray(find)) {
      throw new TypeError('`find` parameter must be an array!')
    }

    if (!Array.isArray(replace)) {
      throw new TypeError('`replace` parameter must be an array!')
    }

    if (!find.length || !replace.length) {
      throw new Error('`find` and `replace` parameters must not be empty!')
    }

    if (find.length !== replace.length) {
      throw new Error('`find` and `replace` parameters must be equal in length!')
    }

    if (regexFlags) {
      if (typeof regexFlags !== 'string') {
        throw new TypeError('`regexFlags` parameter must be a string!')
      } else if (~regexFlags.indexOf('g')) {
        gFlag = true
      } else {
        regexFlags += 'g'
      }
    } else {
      regexFlags = 'g'
    }

    var done = []
    var joined = find.join(')|(')
    var regex = new RegExp('(' + joined + ')', regexFlags)

    return str.replace(regex, (match, ...finds) => {
      var replaced

      finds.some((found, index) => {
        if (found !== undefined) {
          if (gFlag) {
            replaced = replace[index]
          } else if (!~done.indexOf(found)) {
            done.push(found)
            replaced = replace[index]
          } else {
            replaced = found
          }

          return true
        }
      })

      return replaced
    })
  }

  /**
   * replaces MySql placeholders ? with Postre placehoslers $1 $2 $3
   * example:
   * aaaa?bbbb?cccc? => aaaa$1bbbb$2cccc$3
   */
  public static replaceAllMySqlToPostre(s: string): string {
    let cnt = 1;
    return s.replace(/\?/g, function () {
      return `$${cnt++}`;
    });
  }
}
