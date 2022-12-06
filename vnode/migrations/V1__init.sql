-- CREATE DATABASE "vnode1"  WITH OWNER "postgres"
--  ENCODING 'UTF8' LC_COLLATE = 'en_US.utf8'  LC_CTYPE = 'en_US.utf8';

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

-- INSERT INTO public.node_info (node_id, node_url) VALUES ('"1"', 'http://localhost:3000');
