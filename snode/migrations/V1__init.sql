 -- CREATE DATABASE "storage1"  WITH OWNER "postgres"   ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';

/*
 Maps namespace:shardId <-> nodeId, ex:
   inbox:ZZZYYY -> node1
   inbox:ZZZYYY -> node2
   inbox:ZZZYYY -> node3
   .
   .
 */
DROP TABLE IF EXISTS network_storage_layout;
CREATE TABLE IF NOT EXISTS network_storage_layout
(
    id bigint not null primary key,
    namespace VARCHAR(20) NOT NULL,
    namespaceShardId VARCHAR(20) NOT NULL,
    nodeId VARCHAR(20) NOT NULL
);

CREATE INDEX network_storage_layout_ns_index ON network_storage_layout USING btree (namespace ASC, namespaceShardId ASC, nodeId ASC);
CREATE INDEX network_storage_layout_nodeid_index ON network_storage_layout USING btree (nodeId ASC);



/*
How the data is structured
namespace (inbox) -> namespaceShardId (XXXYYY) -> namespaceId (55)
  ->  Collection:  [ROW_DATA, ROW_DATA... ] for 55

How storage_layout works
('inbox', 'XXXYYY', '2022-08-01 00:00:00', '2022-08-31 23:59:59') ->  'storage_ns_inbox_d_202208'
 */
DROP TABLE IF EXISTS node_storage_layout;
CREATE TABLE IF NOT EXISTS node_storage_layout
(
    namespace VARCHAR(20) NOT NULL,
    namespaceShardId VARCHAR(20) NOT NULL,
    tsStart TIMESTAMP NOT NULL default NOW(),
    tsEnd TIMESTAMP NOT NULL default NOW(),
    tableName VARCHAR(20) NOT NULL
);
DROP INDEX IF EXISTS shard_map_ts_index;
CREATE INDEX shard_map_ts_index ON node_storage_layout USING btree (namespace ASC, namespaceShardId ASC, tsStart ASC, tsEnd ASC);


/*
How the data is structured:
  inbox is the namespace name ; 1 table per namespace per month

'inbox' + August'22 (from table name)  -> 'XXXYYY' -> '41' ->  a collection of records {data}
'inbox' + August'22 (from table name)  -> 'XXXYYY' -> '49' ->  ...
'inbox' + August'22 (from table name)  -> 'ZZZZZZ' -> '50' ->  ...
'inbox' + August'22 (from table name)  -> 'ZZZZZZ' -> '51' ->  ...
 */
DROP TABLE IF EXISTS storage_ns_inbox_d_202208;
CREATE TABLE IF NOT EXISTS storage_ns_inbox_d_202208
(
    namespaceShardId VARCHAR(20) NOT NULL,
    namespaceId VARCHAR(20) NOT NULL,
    ts TIMESTAMP NOT NULL default NOW(),
    rowUuid VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON
);

DROP INDEX IF EXISTS storage_table_ns_id_ts_index;
CREATE INDEX storage_table_ns_id_ts_index ON storage_ns_inbox_d_202208 USING btree (namespaceShardId ASC, namespaceId ASC, ts ASC);

comment on column storage_ns_inbox_d_202208.rowUuid is 'unique row id that is globally unique, i.e. ALDKFJ880123';
comment on column storage_ns_inbox_d_202208.namespaceId is 'namespace index usually related to inbox id or chat id, i.e. 991';
comment on column storage_ns_inbox_d_202208.data is 'the useful payload itself';
comment on column storage_ns_inbox_d_202208.ts is 'we store only time series data because we provide sharding by time also, so this is a required field which reporesent the moment when data is appended';


