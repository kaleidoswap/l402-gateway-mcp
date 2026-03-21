/**
 * Re-exports MppClient from kaleido-sdk.
 * The canonical implementation lives in kaleido-sdk/src/mpp.ts.
 */
export {
  MppClient,
} from 'kaleido-sdk/mpp'

export type {
  MppMethod,
  MppIntent,
  MppChallenge,
  MppCredential,
  MppReceipt,
  MppResourceResponse,
} from 'kaleido-sdk/mpp'
