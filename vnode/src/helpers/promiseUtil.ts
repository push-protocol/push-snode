export default class PromiseUtil {

    // Waits for all promises to complete
    public static allSettled<T>(promises: Promise<T>[]): Promise<PromiseResult<T>[]> {
        let wrappedPromises = promises.map(p => {
            return Promise.resolve(p)
                .then(
                    val => new PromiseResult(PromiseResult.SUCCESS, val, null),
                    err => new PromiseResult(PromiseResult.FAILED, null, err));
        });
        return Promise.all(wrappedPromises);
    }

}



export class PromiseResult<T> {
    public static FAILED = -1;
    public static RUNNING = 0;
    public static SUCCESS = 1;

    private _status: number = 0; // -1, 0, 1
    private _val: T;
    private _err: any;

    constructor(status: number, val: T, err: any) {
        this._status = status;
        this._val = val;
        this._err = err;
    }

    public isFullfilled():boolean {
        return this._status == PromiseResult.SUCCESS;
    }

    public isRejected():boolean {
        return this._status == PromiseResult.FAILED;
    }

    public isRunning():boolean {
        return this._status == PromiseResult.RUNNING;
    }

    get status(): number {
        return this._status;
    }

    get val(): T {
        return this._val;
    }

    get err(): any {
        return this._err;
    }
}