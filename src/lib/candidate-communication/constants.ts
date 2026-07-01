import type { CandidateCommunicationStage } from './types';

export const CANDIDATE_COMMUNICATION_STAGES = [
  'new',
  'screening',
  'waiting_resume',
  'resume_received',
  'evaluating',
  'contact_requested',
  'contact_exchanged',
  'rejected',
  'closed',
] as const satisfies readonly CandidateCommunicationStage[];

export const CANDIDATE_COMMUNICATION_TERMINAL_STAGES = [
  'rejected',
  'closed',
] as const satisfies readonly CandidateCommunicationStage[];
