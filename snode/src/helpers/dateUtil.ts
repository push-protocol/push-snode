const { DateTime } = require("luxon");

export default class DateUtil {

    public static formatYYYYMMDD(yearValue:number, monthValue:number, dayValue:number): string {
        return DateTime.fromObject({ year: yearValue, month: monthValue, day: dayValue})
            .toFormat('yyyyMMdd')
    }
}