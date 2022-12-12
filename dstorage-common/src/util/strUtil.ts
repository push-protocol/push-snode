export default class StrUtil {

    public static isEmpty(s:string):boolean {
        if(s === undefined) {
            return true;
        }
        if(typeof s !== 'string') {
            return false;
        }
        return s.length === 0
    }
}