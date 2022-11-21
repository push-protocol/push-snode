
export default class StrUtil {

    public static isEmpty(s:string):boolean {
        if(typeof s !== 'string') {
            return false;
        }
        return s.length === 0
    }
}