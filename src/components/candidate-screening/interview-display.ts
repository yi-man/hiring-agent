import type {
  CandidateInterviewFeedbackDecision,
  CandidateInterviewStage,
} from '@/lib/candidate-screening/types';
import { CANDIDATE_INTERVIEW_STAGE_LABELS } from '@/lib/candidate-screening/constants';

export const interviewStageLabels: Record<CandidateInterviewStage, string> =
  CANDIDATE_INTERVIEW_STAGE_LABELS;

export const feedbackDecisionLabels: Record<CandidateInterviewFeedbackDecision, string> = {
  pass: '通过',
  hold: '待定',
  reject: '淘汰',
};

export function needsInterviewFeedback(stage: CandidateInterviewStage) {
  return stage === 'phone_screen' || stage === 'interviewing';
}
