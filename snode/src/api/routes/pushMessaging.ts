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

const {DateTime} = require("luxon");
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
// curl -X GET --location "http://localhost:4000/api/v1/kv/ns/feeds/nsidx/10/date/20220815/key/a1200bbbb"
// curl -X POST -H "Content-Type: application/json" --location "http://localhost:4000/api/v1/kv/ns/feeds/nsidx/10/date/20220815/key/b120" -d '{"user":"Someone"}'

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
                return res.status(201).json(storageValue);
            } catch (e) {
                // log.error('🔥 error: %o', e);
                return next(e);
            }
        }
    );

    route.post(
        '/ns/:nsName/nsidx/:nsIndex/date/:dt/key/:key', /*  */
        async (req: Request, res: Response, next: NextFunction) => {
            logRequest(req);
            const nsName = req.params.nsName;
            const nsIndex = req.params.nsIndex;
            const dt = req.params.dt;
            const key = req.params.key;
            const nodeId = 1; // todo read this from db
            const body = JSON.stringify(req.body);
            log.debug(`nsName=${nsName} nsIndex=${nsIndex} dt=${dt} key=${key} nodeId=${nodeId} body=${body}`);
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
            log.debug(`parsed date ${dt} -> ${date}`)
            var storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
            log.debug(`found table ${storageTable}`)
            if (StrUtil.isEmpty(storageTable)) {
                log.error('storage table not found');
                var ts_start= DateTime.fromISO(date).startOf('month').toISODate().toString();
                var ts_end= DateTime.fromISO(date).endOf('month').toISODate().toString();
                log.debug('creating new storage table');
                const createtable = await DbHelper.createNewStorageTable(nsName, dt.slice(0,6));
                log.debug('creating node storage layout mapping')
                const createnodelayout=await DbHelper.createNewNodestorageRecord(nsName,shardId,ts_start,ts_end,`storage_ns_${nsName}_d_${dt.slice(0,6)}`);
                log.debug(createnodelayout)
                log.debug(createtable);
            }
            var storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
            const storageValue = await DbHelper.putValueInTable(nsName, shardId, nsIndex, storageTable, key, body);
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

    route.post(
        '/ns/:nsName/nsidx/:nsIndex/date/:dt/listInbox/page/:page', /*  */
        async (req: Request, res: Response, next: NextFunction) => {
            logRequest(req);
            const nsName = req.params.nsName;
            const nsIndex = req.params.nsIndex;
            const dt = req.params.dt;
            const key = req.params.key;
            const nodeId = 1; // todo read this from db
            const body = JSON.stringify(req.body);
            const page = parseInt(req.params.page);
            log.debug(`nsName=${nsName} nsIndex=${nsIndex} dt=${dt} key=${key} nodeId=${nodeId} body=${body}`);
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
            log.debug(`parsed date ${dt} -> ${date}`)
            const storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
            log.debug(`found table ${storageTable}`)
            if (StrUtil.isEmpty(storageTable)) {
                log.error('storage table not found');
                return res.status(401).json('storage table not found');
            }
            const storageValue = await DbHelper.listInbox(nsName, shardId, storageTable, date, page);
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
