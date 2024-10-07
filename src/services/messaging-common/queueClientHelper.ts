import { Logger } from 'winston'

import { Check } from '../../utilz/check'
import { PgUtil } from '../../utilz/pgUtil'
import { WinstonUtil } from '../../utilz/winstonUtil'
import { ValidatorContractState } from './validatorContractState'

export class QueueClientHelper {
  private static log: Logger = WinstonUtil.newLog(QueueClientHelper)

  // updates the dset_client table used for queries according to the contract data
  public static async initClientForEveryQueueForEveryValidator(
    contract: ValidatorContractState,
    queueNames: string[]
  ) {
    Check.notEmptyArr(queueNames, 'queue names missing')
    const allValidators = contract.getAllValidatorsExceptSelf()
    for (const queueName of queueNames) {
      for (const nodeInfo of allValidators) {
        const targetNodeId = nodeInfo.nodeId
        const targetNodeUrl = nodeInfo.url
        const targetState = ValidatorContractState.isEnabled(nodeInfo) ? 1 : 0

        // PostgreSQL version of the insert or update (UPSERT)
        await PgUtil.insert(
          `INSERT INTO dset_client (queue_name, target_node_id, target_node_url, target_offset, state)
           VALUES ($1, $2, $3, 0, $4)
           ON CONFLICT (queue_name, target_node_id) 
           DO UPDATE SET target_node_url = EXCLUDED.target_node_url,
                         state = EXCLUDED.state`,
          queueName,
          targetNodeId,
          targetNodeUrl,
          targetState
        )

        const targetOffset = await PgUtil.queryOneValue<number>(
          `SELECT target_offset
           FROM dset_client
           WHERE queue_name = $1
             AND target_node_id = $2`,
          queueName,
          targetNodeId
        )

        this.log.info(
          'client polls (%s) queue: %s node: %s from offset: %d ',
          targetState,
          queueName,
          targetNodeId,
          targetOffset
        )
      }
    }
  }
}
