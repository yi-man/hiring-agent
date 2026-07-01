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
  return runCandidateCommunicationGraph(params);
}
