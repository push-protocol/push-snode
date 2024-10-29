import { bytesToHex} from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
const PUSH_DID = 'PUSH_DID'
export function PushDidFromMasterPublicKey(masterPublicKey: string): string {
    return  `${PUSH_DID}:${bytesToHex(sha256(masterPublicKey))}`
}