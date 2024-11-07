import Container from 'typedi'

import { IndexStorage } from '../../../src/services/messaging/IndexStorage'

describe('Index Storage Testcases', () => {
  const indexStorage = Container.get(IndexStorage)
  describe('stress testing setting expiry', () => {
    //     it('Should update the expiry of all the trxs that belong to the shard', async () => {
    //       // Script to mass generate massive record
    //       const query = `DO
    // $$
    // DECLARE
    //     shard_id CONSTANT VARCHAR(64) := '124'; -- Replace with the shard_id you want for all records
    // BEGIN
    //     INSERT INTO storage_node (
    //         namespace,
    //         namespace_shard_id,
    //         namespace_id,
    //         ts,
    //         skey,
    //         dataSchema,
    //         payload,
    //         expiration_ts
    //     )
    //     SELECT
    //         'namespace_' || i::text AS namespace, -- Unique namespace for each row
    //         shard_id AS namespace_shard_id,
    //         md5(random()::text) AS namespace_id, -- Random unique namespace_id
    //         NOW() - interval '1 day' * random() AS ts, -- Random timestamp within the past day
    //         md5(random()::text) AS skey, -- Random skey
    //         'schema_' || (i % 5)::text AS dataSchema, -- One of five schemas
    //         jsonb_build_object('key', i, 'value', md5(random()::text)) AS payload, -- Random payload
    //         NOW() + interval '1 day' * (i % 5) AS expiration_ts -- Set an expiration_ts
    //     FROM generate_series(1, 100000) AS s(i);
    // END
    // $$;
    // `
    //       // run it when you want to generate massive records
    //       //   const result = await PgUtil.update(query, [])
    //       const shardsSet = new Set([123, 124])
    //       await indexStorage.setExpiryTime(shardsSet, new Date(Math.floor(Date.now())))
    //     })
    it('Should delete data from the storage_node table', async () => {
      await indexStorage.deleteShardsFromInboxes()
    })
  })
})
