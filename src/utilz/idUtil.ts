import * as uuid from "uuid";

export default class IdUtil {

    public static getUuidV4(): string {
        return uuid.v4();
    }
    // todo type parse = (uuid: string) => Uint8Array;
    // in old node version (< 20.9)
    public static getUuidV4AsBytes(): Uint8Array {
        return uuid.parse(uuid.v4());
    }
}