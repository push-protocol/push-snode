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

    // beforeEach(async () => {
    //   const moduleFixture: TestingModule = await Test.createTestingModule({
    //     imports: [AppModule],
    //   }).compile();
    //
    //   app = moduleFixture.createNestApplication();
    //   await app.init();
    // });

    /*  it('/ (GET)', () => {
        return request(app.getHttpServer())
          .get('/')
          .expect(200)
          .expect('Hello World!');
      });*/

    it('testCollections', () => {
        let sc = new StringCounter();
        sc.increment('c');
        sc.increment('c');
        sc.increment('c');
        sc.increment('a');
        sc.increment('b');
        sc.increment('b');
        expect(sc.get('c')).toEqual(3);
        expect(sc.get('b')).toEqual(2);
        expect(sc.get('a')).toEqual(1);
        expect(sc.get('z')).toBeUndefined();

        {
            let arrAsc: string[] = [];
            sc.iterateSorted((key, count) => {
                arrAsc.push(key);
                console.log('asc', key);
            }, true)
            console.log('arrAsc=', arrAsc);
            expect(arrAsc).toEqual(['a', 'b', 'c']);
        }

        {
            let arrDesc: string[] = [];
            sc.iterateSorted((key, count) => {
                arrDesc.push(key);
                console.log('desc', key);
            }, false)
            console.log('arrDesc=', arrDesc);
            expect(arrDesc).toEqual(['c', 'b', 'a']);
        }
        console.dir(sc);
    });

    it('testAggregatedReply1', () => {
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
        expect(ar.mapKeyToNodeItems.size).toBe(2);
        expect(ar.mapNodeToStatus.get('1')).toBe(200);
        expect(ar.mapNodeToStatus.get('2')).toBe(200);
        let itemMap1 = ar.mapKeyToNodeItems.get('a182ae50-9c3c-4c4e-84cd-f7da66f19357');
        expect(itemMap1.size).toBe(2);
        expect(itemMap1.get('1').payload.name).toBe('john1');
        expect(itemMap1.get('2').payload.name).toBe('john2');
        expect(ar.mapKeyToNodeItems.get('67a876a6-d93f-47e5-8b2f-b087fd0fc2dc').size).toBe(2);


        // console.log(StrUtil.toStringFully(ar));
    });
});
