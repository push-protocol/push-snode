import {DateTime} from "ts-luxon";

export default class RandomUtil {

    public static getRandomInt(min: number, maxExcluded: number): number {
        min = Math.ceil(min);
        maxExcluded = Math.floor(maxExcluded);
        return Math.floor(Math.random() * (maxExcluded - min)) + min;
    }

    public static getRandomDate(min: DateTime, maxExcluded: DateTime): DateTime {
        let minInt = min.toMillis();
        let maxInt = maxExcluded.toMillis();
        let rnd = this.getRandomInt(minInt, maxInt);
        return DateTime.fromMillis(rnd);
    }

    public static getRandomDateSameMonth(date: DateTime): DateTime {
        var monthStart = date.startOf('month');
        var monthEnd = monthStart.plus({months: 1});
        let minInt = monthStart.toMillis();
        let maxInt = monthEnd.toMillis();
        let rnd = this.getRandomInt(minInt, maxInt);
        return DateTime.fromMillis(rnd);
    }
}