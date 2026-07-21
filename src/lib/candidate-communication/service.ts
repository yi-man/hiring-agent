import {
  runCandidateCommunicationGraph,
  type CandidateCommunicationGraphDependencyOverrides,
  type CandidateCommunicationGraphResult,
} from './graph';
import type { CandidateMessagePayload } from './api';

export type HandleCandidateMessageResult = CandidateCommunicationGraphResult;

export async function handleCandidateMessage(params: {
  userId: string;
  payload: CandidateMessagePayload;
  dependencies?: CandidateCommunicationGraphDependencyOverrides;
}): Promise<HandleCandidateMessageResult> {
  if (params.payload.executeReply && !params.payload.message.externalMessageId?.trim()) {
    throw new Error('external message id is required before executing a candidate reply');
  }
  return runCandidateCommunicationGraph(params);
}
