export default class RandomUtil {

    public static getRandomInt(min, maxExcluded): number {
        min = Math.ceil(min);
        maxExcluded = Math.floor(maxExcluded);
        return Math.floor(Math.random() * (maxExcluded - min)) + min;
    }
}