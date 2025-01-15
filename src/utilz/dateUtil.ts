import { DateTime } from 'ts-luxon'
import {Check} from "./check";

export class DateUtil {
  public static readonly MAX_UNIX_TS = Math.floor(new Date('9999-12-31T23:59:59Z').getTime() / 1000);
  public static readonly TIMESTAMP_REGEXP = /^(\d+)$|^(\d+)\.(\d{0,6})$/;
  public static readonly ONE_DAY_IN_MILLISECONDS=86400000

  public static formatYYYYMMDD(yearValue: number, monthValue: number, dayValue: number): string {
    return DateTime.fromObject({ year: yearValue, month: monthValue, day: dayValue }).toFormat(
      'yyyyMMdd'
    )
  }

  public static formatYYYYMMDDEx(dt: DateTime): string {
    return dt.toFormat('yyyyMMdd')
  }

  public static formatYYYYMM(dt: DateTime): string {
    return dt.toFormat('yyyyMM')
  }

  public static buildDateTime(yearValue: number, monthValue: number, dayValue: number): DateTime {
    return DateTime.fromObject({ year: yearValue, month: monthValue, day: dayValue })
  }

  // example: 1661214142.000000
  public static parseUnixFloatOrFail(timestamp: string): number {
    let valid = timestamp.match(this.TIMESTAMP_REGEXP);
    Check.isTrue(valid, 'timestamp format should be XXXXXXXX.YYYYYY where XXXXXXXX is the unit timestamp and Y..YYYYYY is the sub-second precision');
    let result = Number.parseFloat(timestamp);
    Check.isTrue(result >= 0, 'timestamp must be a positive integer');
    Check.isTrue(result <= this.MAX_UNIX_TS, 'timestamp must be less that year 99999');
    return result;
  }

  // example: 1661214142
  public static parseUnixFloatAsInt(timestamp: string): number {
    return Math.floor(Number.parseFloat(timestamp))
  }

  public static parseUnixFloatAsDateTime(timestamp: string): DateTime {
    return DateTime.fromMillis(Number.parseFloat(timestamp) * 1000)
  }

  public static dateTimeToUnixFloat(dt: DateTime): number {
    return dt.toMillis() / 1000.0
  }

  public static currentTimeMillis(): number {
    return new Date().getTime()
  }

  public static currentTimeSeconds(): number {
    return Math.round(new Date().getTime() / 1000)
  }

  public static millisToDate(timestamp: number): Date {
    return new Date(timestamp)
  }

  public static millisToUnixSeconds(timestamp: number): number {
    return Math.round(timestamp / 1000)
  }
}
