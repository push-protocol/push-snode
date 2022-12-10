/**
 * Holds a mapping of
 * 'key' -> COUNTER
 *
 * i.e.
 * 'a' -> 1
 * 'b' -> 2
 * 'c' -> 3
 *
 * and returns it in ascending/descending order
 *
 * Each value holds an additional context object, i.e. 'a' -> 1, { context }
 *
 */
import {map} from "rxjs";

export class StringCounter {
    map: Map<string, ValueHolder> = new Map<string, ValueHolder>();

    public increment(key: string, context: any = null) {
        let holder = this.map.get(key);
        if (holder == null) {
            this.map.set(key, new ValueHolder(1, context));
        } else {
            holder.value++; // using wrapper to avoid get/put
            if(holder.context == null && context != null) {
                holder.context = context; // save only the first non-null value
            }
        }
    }

    public getValue(key: string): number {
        let holder = this.map.get(key);
        return holder == undefined ? null : holder.value;
    }

    public getValueContext(key: string): any {
        let holder = this.map.get(key);
        return holder == undefined ? null : holder.context;
    }

    public iterateAndSort(asc: boolean,
                          callback: (index: number, key: string, count?: number, context?: any) => void) {
        this.sort(asc);
        let i = 0;
        for (const [key, valueHolder] of this.map) {
            callback(i++, key, valueHolder.value, valueHolder.context);
        }
    }

    public getMostFrequentEntry(): ValueHolder {
        let sortedMap = this.toSortedMap(false);
        for (const [key, valueHolder] of sortedMap.entries()) {
            return valueHolder;
        }
        return null;
    }

    public sort(asc: boolean) {
        this.map = this.toSortedMap(asc);
    }

    private toSortedMap(asc: boolean) {
        let sortedMap = new Map<string, ValueHolder>([...this.map].sort((a, b) => {
            // a[0] = key, a[1] = value
            if (a[1].value == b[1].value) return 0;
            if (a[1].value > b[1].value) return asc ? 1 : -1;
            if (a[1].value < b[1].value) return asc ? -1 : 1;
        }));
        return sortedMap;
    }
}

export class ValueHolder {
    value: number;
    context: any = null;

    constructor(value: number, context: any) {
        this.value = value;
        this.context = context;
    }
}