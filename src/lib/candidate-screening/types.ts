export type CandidateScreeningPlatform = 'boss-like';
export type CandidateScreeningMode = 'dry_run' | 'execution';
export type CandidateScreeningRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';
export type CandidateScreeningRunStage =
  | 'planning'
  | 'searching_live'
  | 'ingesting_live'
  | 'indexing_resumes'
  | 'recalling_vectors'
  | 'evaluating'
  | 'ranking'
  | 'planning_actions'
  | 'executing_actions'
  | 'finalizing';
export type CandidateScreeningSource = 'live_search' | 'vector_recall' | 'both';
export type CandidateDecisionAction = 'chat' | 'collect' | 'skip';
export type CandidateDecisionPriority = 'high' | 'medium' | 'low';
export type CandidateActionStatus = 'planned' | 'running' | 'success' | 'failed' | 'skipped';
export type CandidateInterviewStage =
  | 'sourced'
  | 'screened'
  | 'to_contact'
  | 'collected'
  | 'contacted'
  | 'replied'
  | 'phone_screen'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export type EvaluationSchema = {
  skills: string[];
  domainKnowledge: string[];
  generalAbility: string[];
  risk: string[];
};

export type SearchPlan = {
  keywords: string[];
  filters: {
    experience?: string;
    location?: string;
  };
  priorityTags: string[];
  retrievalQuery: string;
};

export type CandidateTags = {
  skills: string[];
  domainKnowledge: string[];
  generalAbility: string[];
  risk: string[];
  activity: string[];
  custom: string[];
};

export type ScoreDetail = {
  skill: number;
  domain: number;
  ability: number;
  risk: number;
  llmBonus: number;
  total: number;
};

export type CandidateActionPlan = {
  action: CandidateDecisionAction;
  priority: CandidateDecisionPriority;
  message: string | null;
  reason: string;
};

export type ScreeningRunStats = {
  fetched: number;
  deduped: number;
  stored: number;
  vectorRecalled: number;
  evaluated: number;
  recommendedChat: number;
  recommendedCollect: number;
  skipped: number;
  failed: number;
};

export type CreateScreeningRunRequest = {
  platform: CandidateScreeningPlatform;
  mode: CandidateScreeningMode;
  maxCandidates: number;
  batchSize: number;
  allowAlreadyContacted: boolean;
};

export type ExecuteActionsRequest = {
  confirmExecution: true;
  maxChatActions: number;
  maxCollectActions: number;
};

export type UpdateCandidateProgressRequest = {
  interviewStage?: CandidateInterviewStage;
  notes?: string;
};
