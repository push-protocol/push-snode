import {Router, Request, Response, NextFunction} from 'express';
import {Container} from 'typedi';
import log from '../../loaders/logger';
import DbHelper from '../../helpers/dbHelper';
import bodyParser from "body-parser";
import {DateTime} from "ts-luxon";
import {ExpressUtil} from "../../utilz/expressUtil";
import DateUtil from "../../utilz/dateUtil";
import StrUtil from "../../utilz/strUtil";
import {ValidatorContractState} from "../../services/messaging-common/validatorContractState";
import onlyLocalhost from "../middlewares/onlyLocalhost";
import StorageNode from "../../services/messaging/storageNode";
import {Coll} from "../../utilz/coll";

const route = Router();
const dbh = new DbHelper();


function logRequest(req: Request) {
  log.debug('Calling %o %o with body: %o', req.method, req.url, req.body);
}

// todo ValidatorContractState
// todo remove logic from router
export function storageRoutes(app: Router) {
  app.use(bodyParser.json());

  app.post(
    '/v1/reshard',
    onlyLocalhost,
    async (req: Request, res: Response, next: NextFunction) => {
      logRequest(req);
      const storageNode = Container.get(StorageNode);
      // ex: { "arr": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14] }
      let arr:number[] = req.body.arr;
      let set = Coll.arrayToSet(arr);
      await storageNode.handleReshard(set)
      return res.status(200);
    });

  app.use('/v1/kv', route);

  route.get(
    '/ns/:nsName/nsidx/:nsIndex/date/:dt/key/:key', /*  */
    async (req: Request, res: Response, next: NextFunction) => {
      logRequest(req);
      const nsName = req.params.nsName;
      const nsIndex = req.params.nsIndex;
      const dt = req.params.dt;
      const key = req.params.key;
      const nodeId = Container.get(ValidatorContractState).nodeId; // todo read this from db
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
      if (!date.isValid) {
        return res.status(400).json('Invalid date ' + dt);
      }
      log.debug(`parsed date ${dt} -> ${date}`)
      const storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
      log.debug(`found table ${storageTable}`)
      if (StrUtil.isEmpty(storageTable)) {
        log.error('storage table not found');
        return res.status(401).json('storage table not found');
      }
      const storageItems = await DbHelper.findStorageItem(nsName, storageTable, key);
      log.debug(`found value: ${storageItems}`)
      log.debug('success is ' + success);
      try {
        return res.status(200).json({
          items: storageItems
        });
      } catch (e) {
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
      const ts: string = req.params.ts; //ex: 1661214142.123456
      const key = req.params.key; // ex: 5b62a7b2-d6eb-49ef-b080-20a7fa3091ad
      const nodeId = Container.get(ValidatorContractState).nodeId; // todo read this from db
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
          await DbHelper.createNewStorageTable(tableName);
          log.debug('creating node storage layout mapping')
        }
      }
      var storageTable = await DbHelper.findStorageTableByDate(nsName, shardId, date);
      const storageValue = await DbHelper.putValueInTable(nsName, shardId, nsIndex, storageTable, ts, key, body);
      log.debug(`found value: ${storageValue}`)
      log.debug('success is ' + success);
      try {
        return res.status(201).json(storageValue);
      } catch (e) {
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
      const firstTs: string = <string>req.query.firstTs;
      const nsName = req.params.nsName;
      const nsIndex = req.params.nsIndex;
      const dt = req.params.month + '01';
      const key = req.params.key;
      const nodeId = Container.get(ValidatorContractState).nodeId; // todo read this from db
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
      const storageValue = await DbHelper.listInbox(nsName, shardId, nsIndex, storageTable, firstTs);
      log.debug(`found value: ${storageValue}`)
      log.debug('success is ' + success);
      try {
        return res.status(200).json(storageValue);
      } catch (e) {
        return next(e);
      }
    }
  );
};
