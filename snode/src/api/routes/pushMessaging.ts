import {Router, Request, Response, NextFunction} from 'express';
import {Container} from 'typedi';
// import MessagingService from '../../services/pushMessageService';
import middlewares from '../middlewares';
import {celebrate, Joi} from 'celebrate';
import log from '../../loaders/logger';
import DbHelper from '../../helpers/dbHelper';
import {isEmpty} from "lodash";
import StrUtil from "../../helpers/strUtil";

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

export default (app: Router) => {
    app.use('/v1/kv', route);
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

            log.debug('success is ' + success);
            try {
                // const messaging = Container.get(MessagingService);
                return res.status(201).json('test');
            } catch (e) {
                // log.error('🔥 error: %o', e);
                return next(e);
            }
        }
    );
};
