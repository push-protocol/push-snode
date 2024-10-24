export class ArrayUtil {

  public static isEmpty<T>(arr: T[] | Uint8Array | null): boolean {
    if (arr == null) {
      return true;
    }
    if (typeof arr !== 'object') {
      return false;
    }
    return arr.length === 0
  }

  private static isArrayEmpty(array: Uint8Array | null): boolean {
    return array == null || array.length === 0;
  }

  public static hasMinSize(array: Uint8Array, minSize: number): boolean {
    if (minSize === 0) {
      return ArrayUtil.isArrayEmpty(array);
    }
    return array.length >= minSize;
  }

  public static isEqual(arr0: Uint8Array, arr1: Uint8Array): boolean {
    if (arr0 == null && arr1 == null) {
      return true;
    }
    if (arr0 == arr1) {
      return true
    }
    if (arr0.length !== arr1.length) {
      return false;
    }
    return Buffer.from(arr0).equals(Buffer.from(arr1));
  }
}