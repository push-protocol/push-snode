export default class PromiseUtil {

    // Waits for all promises to complete
    public static allSettled(promises: Promise<any>[]): Promise<WrappedResult[]> {
        let wrappedPromises = promises.map(p => Promise.resolve(p)
            .then(
                val => (<WrappedResult>{status: 'fulfilled', value: val}),
                err => (<WrappedResult>{status: 'rejected', reason: err})));
        return Promise.all(wrappedPromises);
    }

}

// todo use interface
interface WrappedResult {
    // 'fulfilled', 'rejected'
    status: string;
    value: any;
    reason: any;
}