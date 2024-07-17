/* CREATE DATABASE "snode1"  WITH OWNER "postgres"
 ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';*/

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
    namespace_shard_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL
);

ALTER TABLE network_storage_layout DROP CONSTRAINT IF EXISTS network_storage_layout_uniq;
ALTER TABLE network_storage_layout ADD CONSTRAINT network_storage_layout_uniq UNIQUE (namespace, namespace_shard_id, node_id);
CREATE INDEX network_storage_layout_ns_index ON network_storage_layout USING btree (namespace ASC, namespace_shard_id ASC, node_id ASC);
CREATE INDEX network_storage_layout_nodeid_index ON network_storage_layout USING btree (node_id ASC);



/*
How the data is structured on this node: maps time periods to table
namespace (inbox) -> namespace_shard_id (XXXYYY) -> namespaceId (55)
  ->  Collection:  [ROW_DATA, ROW_DATA... ] for 55

How storage_layout works
('inbox', 'XXXYYY', '2022-08-01 00:00:00', '2022-08-31 23:59:59') ->  'storage_ns_inbox_d_202208'

ex:
  inbox is the namespace name ; 1 table per namespace per month

'inbox' + August'22 (from table name)  -> 'XXXYYY' -> '41' ->  a collection of records {data}
'inbox' + August'22 (from table name)  -> 'XXXYYY' -> '49' ->  ...
'inbox' + August'22 (from table name)  -> 'ZZZZZZ' -> '50' ->  ...
'inbox' + August'22 (from table name)  -> 'ZZZZZZ' -> '51' ->  ...
 */
DROP TABLE IF EXISTS node_storage_layout;
CREATE TABLE IF NOT EXISTS node_storage_layout
(
    namespace VARCHAR(20) NOT NULL,
    namespace_shard_id VARCHAR(64) NOT NULL,
    ts_start TIMESTAMP NOT NULL default NOW(),
    ts_end TIMESTAMP NOT NULL default NOW(),
    table_name VARCHAR(64) NOT NULL,
    PRIMARY KEY(namespace, namespace_shard_id, ts_start, ts_end)
);

