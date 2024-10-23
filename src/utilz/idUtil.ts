import * as uuid from "uuid";
import {BitUtil} from "./bitUtil";

export default class IdUtil {

    public static getUuidV4(): string {
        return uuid.v4();
    }

    public static getUuidV4AsBytes(): Uint8Array {
        const uint8ArrayOrArrayLikeInNode20_9 = uuid.parse(uuid.v4());
        return Uint8Array.from(uuid.parse(uuid.v4()))
    }
}