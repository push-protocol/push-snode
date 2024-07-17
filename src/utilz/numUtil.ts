export class NumUtil {
  public static parseInt(val: string | number | null, defaultValue: number): number {
    if (val === null) {
      return defaultValue
    }
    const valN = typeof val === 'string' ? Number(val) : val
    if (isNaN(valN)) {
      return defaultValue
    }
    return this.isRoundedInteger(valN) ? valN : Math.round(valN)
  }

  static isRoundedInteger(valN: number) {
    return Number.isInteger(valN);
  }

  public static toString(value: number) {
    if (value == null) {
      return ''
    }
    return '' + value
  }
}
