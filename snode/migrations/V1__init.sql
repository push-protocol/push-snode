-- CREATE DATABASE "postgres"  WITH OWNER "postgres"
--  ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';

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
    id SERIAL PRIMARY KEY NOT NULL,
    namespace VARCHAR(20) NOT NULL,
    namespace_shard_id VARCHAR(20) NOT NULL,
    node_id VARCHAR(20) NOT NULL
);

CREATE INDEX network_storage_layout_ns_index ON network_storage_layout USING btree (namespace ASC, namespace_shard_id ASC, node_id ASC);
CREATE INDEX network_storage_layout_nodeid_index ON network_storage_layout USING btree (node_id ASC);



/*
How the data is structured on this node: maps time periods to table
namespace (inbox) -> namespace_shard_id (XXXYYY) -> namespaceId (55)
  ->  Collection:  [ROW_DATA, ROW_DATA... ] for 55

How storage_layout works
('inbox', 'XXXYYY', '2022-08-01 00:00:00', '2022-08-31 23:59:59') ->  'storage_ns_inbox_d_202208'
 */
DROP TABLE IF EXISTS node_storage_layout;
CREATE TABLE IF NOT EXISTS node_storage_layout
(
    namespace VARCHAR(20) NOT NULL,
    namespace_shard_id VARCHAR(20) NOT NULL,
    ts_start TIMESTAMP NOT NULL default NOW(),
    ts_end TIMESTAMP NOT NULL default NOW(),
    table_name VARCHAR(64) NOT NULL
);
DROP INDEX IF EXISTS shard_map_ts_index;
CREATE INDEX shard_map_ts_index ON node_storage_layout USING btree (namespace ASC, namespace_shard_id ASC, ts_start ASC, ts_end ASC);
ALTER TABLE node_storage_layout DROP CONSTRAINT IF EXISTS node_storage_layout_uniq;
ALTER TABLE node_storage_layout ADD CONSTRAINT node_storage_layout_uniq UNIQUE (namespace, namespace_shard_id, ts_start, ts_end);

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
    namespace VARCHAR(20) NOT NULL,
    namespace_shard_id VARCHAR(20) NOT NULL,
    namespace_id VARCHAR(20) NOT NULL,
    ts TIMESTAMP NOT NULL default NOW(),
    rowUuid VARCHAR(64) NOT NULL PRIMARY KEY,
    dataSchema VARCHAR(20) NOT NULL,
    payload JSONB
);

DROP INDEX IF EXISTS storage_table_ns_id_ts_index;
CREATE INDEX storage_table_ns_id_ts_index ON storage_ns_inbox_d_202208 USING btree (namespace ASC, namespace_shard_id ASC, namespace_id ASC, ts ASC);

comment on column storage_ns_inbox_d_202208.rowUuid is 'unique row id that is globally unique, i.e. ALDKFJ880123';
comment on column storage_ns_inbox_d_202208.namespace_id is 'namespace index usually related to inbox id or chat id, i.e. 991';
comment on column storage_ns_inbox_d_202208.ts is 'we store only time series data because we provide sharding by time also, so this is a required field which reporesent the moment when data is appended';

