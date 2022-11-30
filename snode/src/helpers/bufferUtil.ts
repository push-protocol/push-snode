export default class BufferUtil {

    public static toBase64(buf:Buffer): string {
        return buf.toString('base64')
    }
}