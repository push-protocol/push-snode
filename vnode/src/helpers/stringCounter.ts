export class StringCounter {
    map: Map<string, NumberHolder> = new Map<string, NumberHolder>();

    public increment(key: string) {
        StringCounter.incrementByKey(this.map, key);
    }

    public get(key: string):number {
        let holder = this.map.get(key);
        return holder == undefined ? undefined : holder.value;
    }

    public iterateSorted(callback: (key: string, count: number) => void, asc: boolean = true) {
        let sortedMap = StringCounter.sortMapByNumberValue(this.map, asc);
        for (const [key, count] of sortedMap) {
            callback(key, count.value);
        }
    }

    public static sortMapByNumberValue(map: Map<string, NumberHolder>, asc: boolean): Map<string, NumberHolder> {
        // a[0] = key, a[1] = value
        const m3 = new Map<string, NumberHolder>([...map].sort((a, b) => {
            if (a[1].value == b[1].value) return 0;
            if (a[1].value > b[1].value) return asc ? 1 : -1;
            if (a[1].value < b[1].value) return asc ? -1 : 1;
        }));
        return m3;
    }

    public static incrementByKey(map: Map<string, NumberHolder>, key: string) {
        let holder = map.get(key);
        if (holder == null) {
            map.set(key, new NumberHolder(1));
        } else {
            holder.value++; // using wrapper to avoid get/put
        }
    }
}

class NumberHolder {
    value:number;

    constructor(value: number) {
        this.value = value;
    }
}