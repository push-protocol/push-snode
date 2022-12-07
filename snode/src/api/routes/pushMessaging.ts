import {Router, Request, Response, NextFunction} from 'express';
import {Container} from 'typedi';
// import MessagingService from '../../services/pushMessageService';
import middlewares from '../middlewares';
import {celebrate, Joi} from 'celebrate';
import log from '../../loaders/logger';
import DbHelper from '../../helpers/dbHelper';
import {isEmpty} from "lodash";
import StrUtil from "../../helpers/strUtil";
import bodyParser from "body-parser";
import DateUtil from "../../helpers/dateUtil";

import {DateTime} from "ts-luxon";
// const log = Container.get('logger');
// console.log("pushMessaging imported");

const route = Router();
const dbh = new DbHelper();

function splitIntoNameAndIndex(nsNameWithIndex: string): string[] {
    return nsNameWithIndex.split('.', 2);
}

function logRequest(req: Request) {
    log.debug('Calling %o %o with body: %o', req.method, req.url, req.body);
}
// curl -X GET --location "http://localhost:3000/api/v1/kv/ns/feeds/nsidx/1000000/date/20220815/key/a1200bbbb"
// curl -X POST -H "Content-Type: application/json" --location "http://localhost:3000/api/v1/kv/ns/feeds/nsidx/1000000/ts/1661214142.000000/key/b120" -d '{"user":"Someone"}'
// curl -X POST -H "Content-Type: application/json" --location "http://localhost:3000/api/v1/kv/ns/feeds/nsidx/1000000/month/202208/list?firstTs=1661214142.000000"

export default (app: Router) => {
    app.use(bodyParser.json());

    app.use('/v1/kv', route);

    app.post('/post-test', (req, res) => {
        console.log('Got body:', req.body);
        res.sendStatus(200);
    });

    route.get(
        '/ns/:nsName/nsidx/:nsIndex/date/:dt/key/:key', /*  */
        async (req: Request, res: Response, next: NextFunction) => {
            logRequest(req);
            const nsName = req.params.nsName;
            const nsIndex = req.params.nsIndex;
            const dt = req.params.dt;
            const key = req.params.key;
            const nodeId = 1; // todo read this from db
            log.debug(`nsName=${nsName} nsIndex=${nsIndex} dt=${dt} key=${key} nodeId=${nodeId}`);
            let shardId = DbHelper.calculateShardForNamespaceIndex(nsName, nsIndex);
            log.debug(`nodeId=${nodeId} shardId=${shardId}`);
            const success = await DbHelper.checkThatShardIsOnThisNode(nsName, shardId, nodeId);
            if (!success) {
                let errMsg = `${nsName}.${nsIndex} maps to shard ${shardId} which is missing on node ${nodeId}`;
                console.log(errMsg);
                return res.status(500)
                    .json({errorMessage: errMsg})
            }
            const date = DateTime.fromISO(dt, {zone: 'utc'});
            if(!date.isValid) {
                return res.status(400).json('Invalid date ' + dt);
            }
            log.debug(`parsed date ${dt} -> ${date}`)
            const storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
            log.debug(`found table ${storageTable}`)
            if (StrUtil.isEmpty(storageTable)) {
                log.error('storage table not found');
                return res.status(401).json('storage table not found');
            }
            const storageValue = await DbHelper.findValueInTable(storageTable, key);
            log.debug(`found value: ${storageValue}`)
            log.debug('success is ' + success);
            try {
                // const messaging = Container.get(MessagingService);
                return res.status(200).json(storageValue);
            } catch (e) {
                // log.error('🔥 error: %o', e);
                return next(e);
            }
        }
    );

    route.post(
        '/ns/:nsName/nsidx/:nsIndex/ts/:ts/key/:key', /*  */
        async (req: Request, res: Response, next: NextFunction) => {
            logRequest(req);
            const nsName = req.params.nsName; // ex: feeds
            const nsIndex = req.params.nsIndex; // ex: 1000000
            const ts:string = req.params.ts; //ex: 1661214142.123456
            const key = req.params.key; // ex: 5b62a7b2-d6eb-49ef-b080-20a7fa3091ad
            const nodeId = 1; // todo read this from db
            const body = JSON.stringify(req.body);
            log.debug(`nsName=${nsName} nsIndex=${nsIndex} ts=${ts} key=${key} nodeId=${nodeId} body=${body}`);
            let shardId = DbHelper.calculateShardForNamespaceIndex(nsName, nsIndex);
            log.debug(`nodeId=${nodeId} shardId=${shardId}`);
            const success = await DbHelper.checkThatShardIsOnThisNode(nsName, shardId, nodeId);
            if (!success) {
                let errMsg = `${nsName}.${nsIndex} maps to shard ${shardId} which is missing on node ${nodeId}`;
                console.log(errMsg);
                return res.status(500)
                    .json({errorMessage: errMsg})
            }
            const date = DateUtil.parseUnixFloatAsDateTime(ts);
            log.debug(`parsed date ${ts} -> ${date}`)
            var storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
            log.debug(`found table ${storageTable}`)
            if (StrUtil.isEmpty(storageTable)) {
                log.error('storage table not found');
                var monthStart = date.startOf('month').toISODate().toString();
                var monthEndExclusive = date.startOf('month').plus({months: 1}).toISODate().toString();
                log.debug('creating new storage table');
                const dateYYYYMM = DateUtil.formatYYYYMM(date);
                const tableName = `storage_ns_${nsName}_d_${dateYYYYMM}`;
                const recordCreated = await DbHelper.createNewNodestorageRecord(nsName, shardId,
                    monthStart, monthEndExclusive, tableName);
                if (recordCreated) {
                    log.debug('record created: ', recordCreated)
                    // we've added a new record to node_storage_layout => we can safely try to create a table
                    // otherwise, if many connections attempt to create a table from multiple threads
                    // it leads to postgres deadlock sometimes
                    const createtable = await DbHelper.createNewStorageTable(tableName);
                    log.debug('creating node storage layout mapping')
                    log.debug(createtable);
                }
            }
            var storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
            const storageValue = await DbHelper.putValueInTable(nsName, shardId, nsIndex, storageTable, ts, key, body);
            log.debug(`found value: ${storageValue}`)
            log.debug('success is ' + success);
            try {
                // const messaging = Container.get(MessagingService);
                return res.status(201).json(storageValue);
            } catch (e) {
                // log.error('🔥 error: %o', e);
                return next(e);
            }
        }
    );

    /* Search for namespace:namespaceIndex data , ordered by timestamp asc, paginated by timestamp (!)
       Pagination is achieved by using firstTs parameter, passed from the previous invocation
       Timestamp example: 1661214142.000000 ( unixtime.microseconds )
    * */
    route.post(
        '/ns/:nsName/nsidx/:nsIndex/month/:month/list/', /*  */
        async (req: Request, res: Response, next: NextFunction) => {
            logRequest(req);
            // we will search for data starting from this key exclusive
            // use lastTs from the previous request to get more data
            const firstTs:string = <string>req.query.firstTs;
            const nsName = req.params.nsName;
            const nsIndex = req.params.nsIndex;
            const dt = req.params.month + '01';
            const key = req.params.key;
            const nodeId = 1; // todo read this from db
            const body = JSON.stringify(req.body);
            const page = parseInt(req.params.page);
            log.debug(`nsName=${nsName} nsIndex=${nsIndex} dt=${dt} key=${key} nodeId=${nodeId}  firstTs=${firstTs} body=${body}`);
            let shardId = DbHelper.calculateShardForNamespaceIndex(nsName, nsIndex);
            log.debug(`nodeId=${nodeId} shardId=${shardId}`);
            const success = await DbHelper.checkThatShardIsOnThisNode(nsName, shardId, nodeId);
            if (!success) {
                let errMsg = `${nsName}.${nsIndex} maps to shard ${shardId} which is missing on node ${nodeId}`;
                console.log(errMsg);
                return res.status(500)
                    .json({errorMessage: errMsg})
            }
            const date = DateTime.fromISO(dt, {zone: 'utc'});
            log.debug(`parsed date ${date} -> ${date}`)
            // since the date is 1st day of month - we can do a lookup of the table name
            const storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
            log.debug(`found table ${storageTable}`)
            if (StrUtil.isEmpty(storageTable)) {
                log.error('storage table not found');
                return res.status(204).json(`storage table not found for date ${req.params.month}`);
            }
            const storageValue = await DbHelper.listInbox(nsName, shardId, storageTable, firstTs);
            log.debug(`found value: ${storageValue}`)
            log.debug('success is ' + success);
            try {
                // const messaging = Container.get(MessagingService);
                return res.status(201).json(storageValue);
            } catch (e) {
                // log.error('🔥 error: %o', e);
                return next(e);
            }
        }
    );
};
