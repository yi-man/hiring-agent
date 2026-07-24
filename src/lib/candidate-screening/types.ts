import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';
import type { CandidateInterviewAssignment } from '@/lib/interviews/types';

export type CandidateScreeningPlatform = RecruitmentPlatform;
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
export type CandidateScreeningRunEventLevel = 'info' | 'success' | 'warning' | 'error';
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
  | 'interview_completed'
  | 'offer'
  | 'onboarded'
  | 'not_joined'
  | 'rejected'
  | 'withdrawn';
export type CandidateInterviewFeedbackStage = string;
export type CandidateInterviewFeedbackDecision = 'pass' | 'reject' | 'hold';
export type CandidateEvaluationDimensionKey =
  | 'core_competency'
  | 'problem_solving'
  | 'impact'
  | 'collaboration'
  | 'motivation';
export type CandidateInterviewDimensionRating = {
  dimension: CandidateEvaluationDimensionKey;
  score: number;
  evidence: string;
};
export type CandidateHireDecision = 'strong_yes' | 'yes' | 'no';
export type CandidateDecisionIntentLevel = 'high' | 'medium' | 'low';
export type CandidateDecisionRiskLevel = 'low' | 'medium' | 'high';
export type CandidateCalibrationCategory =
  | 'technical'
  | 'data_ai'
  | 'product'
  | 'sales'
  | 'operations'
  | 'design'
  | 'management'
  | 'general';

export type CandidateCalibrationAnchor = {
  label: string;
  expectedAction: CandidateDecisionAction;
  scoreRange: [number, number];
  positiveSignals: string[];
  riskSignals: string[];
  guidance: string;
};

export type CandidateCalibrationProfile = {
  version: string;
  category: CandidateCalibrationCategory;
  categoryLabel: string;
  anchors: CandidateCalibrationAnchor[];
  reviewSampling: string[];
};

export type CandidateScoringQualityPolicy = {
  version: string;
  promptVersion: string;
  scoringVersion: string;
  calibrationVersion: string;
  regressionTiers: Array<{
    name: string;
    trigger: string;
    llmCalls: 'none' | 'small-sample' | 'full-sample';
    description: string;
  }>;
  iterationSteps: string[];
};

export type EvaluationSchema = {
  skills: string[];
  domainKnowledge: string[];
  generalAbility: string[];
  risk: string[];
  calibrationProfile?: CandidateCalibrationProfile;
  qualityPolicy?: CandidateScoringQualityPolicy;
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
  promptVersion?: string;
  scoringVersion?: string;
  calibrationVersion?: string;
  qualityPolicyVersion?: string;
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
  interviewAssignments?: CandidateInterviewAssignment[];
};

export type UpsertCandidateInterviewFeedbackRequest = {
  stage: CandidateInterviewFeedbackStage;
  interviewer: string;
  rating: number;
  dimensionRatings: CandidateInterviewDimensionRating[];
  pros: string[];
  cons: string[];
  decision: CandidateInterviewFeedbackDecision;
  notes?: string | null;
};

export type EvaluateCandidateDecisionRequest = {
  jobDescriptionId: string;
  candidateId: string;
};
