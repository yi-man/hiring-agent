export type CandidateCommunicationStage =
  | 'new'
  | 'screening'
  | 'waiting_resume'
  | 'resume_received'
  | 'evaluating'
  | 'contact_requested'
  | 'contact_exchanged'
  | 'rejected'
  | 'closed';

export type CandidateMessageIntent =
  | 'greeting'
  | 'resume_shared'
  | 'salary_question'
  | 'job_question'
  | 'contact_shared'
  | 'not_interested'
  | 'unknown';

export type CandidateIntentLevel = 'high' | 'medium' | 'low';

export type CandidateCommunicationAction =
  | 'reply'
  | 'request_resume'
  | 'request_contact'
  | 'capture_resume'
  | 'capture_contact'
  | 'answer_question'
  | 'mark_rejected'
  | 'close'
  | 'noop';

export type CandidateMessageRole = 'candidate' | 'agent';

export type CandidateMessageDeliveryStatus = 'received' | 'planned' | 'sent' | 'failed';

export type CandidateCommunicationDecision = {
  intent: CandidateMessageIntent;
  intentLevel: CandidateIntentLevel;
  nextStage: CandidateCommunicationStage;
  shouldReply: boolean;
  reply: string | null;
  actions: CandidateCommunicationAction[];
  rationale: string;
};
