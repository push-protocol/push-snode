import {Test, TestingModule} from '@nestjs/testing';
import {INestApplication} from '@nestjs/common';
import * as request from 'supertest';
import {AppModule} from './../src/app.module';
import StrUtil from "../src/helpers/strUtil";
import exp from "constants";
import {AggregatedReplyHelper} from "../src/AggregatedReplyHelper";
import CollectionUtil from "../src/helpers/collectionUtil";
import {StringCounter} from "../src/helpers/stringCounter";

describe('AppController (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        global.console = require('console');
    //   const moduleFixture: TestingModule = await Test.createTestingModule({
    //     imports: [AppModule],
    //   }).compile();
    //
    //   app = moduleFixture.createNestApplication();
    //   await app.init();
    });

    /*  it('/ (GET)', () => {
        return request(app.getHttpServer())
          .get('/')
          .expect(200)
          .expect('Hello World!');
      });*/

    it('testCollections', () => {
        let sc = new StringCounter();
        sc.increment('c', {name: 'john1'});
        sc.increment('c');
        sc.increment('c', {name: 'john2'});
        sc.increment('a');
        sc.increment('b');
        sc.increment('b');
        expect(sc.getValue('c')).toEqual(3);
        expect(sc.getValueContext('c')).toEqual({name: 'john1'}); // take 1st value always
        expect(sc.getValue('b')).toEqual(2);
        expect(sc.getValue('a')).toEqual(1);
        expect(sc.getValueContext('a')).toBeNull();
        expect(sc.getValue('z')).toBeNull();

        {
            let arrAsc: string[] = [];
            sc.iterateAndSort(true, (idx, key, count) => {
                arrAsc.push(key);
                console.log('asc', key);
            })
            console.log('arrAsc=', arrAsc);
            expect(arrAsc).toEqual(['a', 'b', 'c']);
        }

        {
            let arrDesc: string[] = [];
            sc.iterateAndSort(false, (idx, key, count) => {
                arrDesc.push(key);
                console.log('desc', key);
            })
            console.log('arrDesc=', arrDesc);
            expect(arrDesc).toEqual(['c', 'b', 'a']);
        }
        console.dir(sc);
    });

    it('testAggregatedReplyHelper1', () => {
        let ar = new AggregatedReplyHelper();
        ar.appendItems('1', 200, {
            "items": [
                {
                    "ns": "feeds",
                    "key": "a182ae50-9c3c-4c4e-84cd-f7da66f19357",
                    "ts": "1420101402.476000",
                    "payload": {
                        "id": 76576,
                        "name": "john1",
                        "surname": "YI2VaCPDU/BvvQ=="
                    }
                },
                {
                    "ns": "feeds",
                    "key": "67a876a6-d93f-47e5-8b2f-b087fd0fc2dc",
                    "ts": "1420157966.693000",
                    "payload": {
                        "name": "john1",
                    }
                }
            ]
        });
        ar.appendItems('2', 200, {
            "items": [
                {
                    "ns": "feeds",
                    "key": "a182ae50-9c3c-4c4e-84cd-f7da66f19357",
                    "ts": "1420101402.476000",
                    "payload": {
                        "name": "john2",
                    }
                },
                {
                    "ns": "feeds",
                    "key": "67a876a6-d93f-47e5-8b2f-b087fd0fc2dc",
                    "ts": "1420157966.693000",
                    "payload": {
                        "name": "john2",
                    }
                }
            ]
        });
        console.dir(ar, {depth: null});
        expect(ar.mapKeyToNodeItems.size).toEqual(2);
        expect(ar.mapNodeToStatus.get('1')).toEqual(200);
        expect(ar.mapNodeToStatus.get('2')).toEqual(200);
        let itemMap1 = ar.mapKeyToNodeItems.get('a182ae50-9c3c-4c4e-84cd-f7da66f19357');
        expect(itemMap1.size).toEqual(2);
        expect(itemMap1.get('1').payload.name).toEqual('john1');
        expect(itemMap1.get('2').payload.name).toEqual('john2');
        expect(ar.mapKeyToNodeItems.get('67a876a6-d93f-47e5-8b2f-b087fd0fc2dc').size).toEqual(2);
    });

    it('testAggregatedReplyHelper2', () => {
        let ar = new AggregatedReplyHelper();
        ar.appendItems('node1', 200, {
            "items": [
                {
                    "ns": "feeds",
                    "key": "key1",
                    "ts": "1420101402.476000",
                    "payload": {
                        "id": 100,
                        "name": "john1"
                    }
                },
                {
                    "ns": "feeds",
                    "key": "key2",
                    "ts": "1420157966.693000",
                    "payload": {
                        "id": 200,
                        "name": "john2",
                    }
                }
            ]
        });
        ar.appendItems('node2', 200, {
            "items": [
                {
                    "ns": "feeds",
                    "key": "key2",
                    "ts": "1420157966.693000",
                    "payload": {
                        "id": 200,
                        "name": "john2",
                    }
                },
                {
                    "ns": "feeds",
                    "key": "key1",
                    "ts": "1420101402.476000",
                    "payload": {
                        "id": 100,
                        "name": "john1"
                    }
                }
            ]
        });
        console.dir(ar, {depth: null});
        let aggregatedReply = ar.aggregateItems(1);
        console.log(aggregatedReply);
        // console.log(StrUtil.toStringFully(ar));
    });
});
