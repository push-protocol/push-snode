
-- vnode init script start

CREATE DATABASE "vnode1"  WITH OWNER "postgres"
ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';

\c vnode1;

/*
 Maps namespace:shardId <-> nodeId, ex:
   inbox:1 -> node1
   inbox:2 -> node2
   inbox:127 -> node3
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
  Node information: id -> url, ex
  "1" -> http://localhost:3000
*/
DROP TABLE IF EXISTS node_info;
CREATE TABLE IF NOT EXISTS node_info
(
    node_id VARCHAR(20) PRIMARY KEY NOT NULL,
    node_url VARCHAR(50) NOT NULL
);
-- vnode init script ends

-- snode1 init scriipt starts

 CREATE DATABASE "snode1"  WITH OWNER "postgres"
 ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';

\c snode1

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
    namespace_shard_id VARCHAR(20) NOT NULL,
    ts_start TIMESTAMP NOT NULL default NOW(),
    ts_end TIMESTAMP NOT NULL default NOW(),
    table_name VARCHAR(64) NOT NULL
);
DROP INDEX IF EXISTS shard_map_ts_index;
CREATE INDEX shard_map_ts_index ON node_storage_layout USING btree (namespace ASC, namespace_shard_id ASC, ts_start ASC, ts_end ASC);
ALTER TABLE node_storage_layout DROP CONSTRAINT IF EXISTS node_storage_layout_uniq;
ALTER TABLE node_storage_layout ADD CONSTRAINT node_storage_layout_uniq UNIQUE (namespace, namespace_shard_id, ts_start, ts_end);

-- snode1 init script ends


-- snode2 init scriipt starts

 CREATE DATABASE "snode2"  WITH OWNER "postgres"
 ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';


\c snode2
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
    namespace_shard_id VARCHAR(20) NOT NULL,
    ts_start TIMESTAMP NOT NULL default NOW(),
    ts_end TIMESTAMP NOT NULL default NOW(),
    table_name VARCHAR(64) NOT NULL
);
DROP INDEX IF EXISTS shard_map_ts_index;
CREATE INDEX shard_map_ts_index ON node_storage_layout USING btree (namespace ASC, namespace_shard_id ASC, ts_start ASC, ts_end ASC);
ALTER TABLE node_storage_layout DROP CONSTRAINT IF EXISTS node_storage_layout_uniq;
ALTER TABLE node_storage_layout ADD CONSTRAINT node_storage_layout_uniq UNIQUE (namespace, namespace_shard_id, ts_start, ts_end);

-- snode2 init script ends


-- snode3 init scriipt starts

 CREATE DATABASE "snode3"  WITH OWNER "postgres"
 ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';

\c snode3
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
    namespace_shard_id VARCHAR(20) NOT NULL,
    ts_start TIMESTAMP NOT NULL default NOW(),
    ts_end TIMESTAMP NOT NULL default NOW(),
    table_name VARCHAR(64) NOT NULL
);
DROP INDEX IF EXISTS shard_map_ts_index;
CREATE INDEX shard_map_ts_index ON node_storage_layout USING btree (namespace ASC, namespace_shard_id ASC, ts_start ASC, ts_end ASC);
ALTER TABLE node_storage_layout DROP CONSTRAINT IF EXISTS node_storage_layout_uniq;
ALTER TABLE node_storage_layout ADD CONSTRAINT node_storage_layout_uniq UNIQUE (namespace, namespace_shard_id, ts_start, ts_end);

-- snode3 init script ends


-- snode4 init scriipt starts

 CREATE DATABASE "snode4"  WITH OWNER "postgres"
 ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';


\c snode4
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
    namespace_shard_id VARCHAR(20) NOT NULL,
    ts_start TIMESTAMP NOT NULL default NOW(),
    ts_end TIMESTAMP NOT NULL default NOW(),
    table_name VARCHAR(64) NOT NULL
);
DROP INDEX IF EXISTS shard_map_ts_index;
CREATE INDEX shard_map_ts_index ON node_storage_layout USING btree (namespace ASC, namespace_shard_id ASC, ts_start ASC, ts_end ASC);
ALTER TABLE node_storage_layout DROP CONSTRAINT IF EXISTS node_storage_layout_uniq;
ALTER TABLE node_storage_layout ADD CONSTRAINT node_storage_layout_uniq UNIQUE (namespace, namespace_shard_id, ts_start, ts_end);

-- snode4 init script ends