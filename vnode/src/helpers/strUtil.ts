
export default class StrUtil {

    public static isEmpty(s:string):boolean {
        if(typeof s !== 'string') {
            return false;
        }
        return s.length === 0
    }

    public static toStringFully(obj:any):string {
        return JSON.stringify(obj, null, 4)
    }

    public static toString(n:number):string {
        return n == null ? '' : n.toString();
    }
}