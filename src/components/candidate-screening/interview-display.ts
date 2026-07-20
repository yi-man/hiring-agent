import type {
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
  CandidateInterviewStage,
} from '@/lib/candidate-screening/types';
import { CANDIDATE_INTERVIEW_STAGE_LABELS } from '@/lib/candidate-screening/constants';

export const interviewStageLabels: Record<CandidateInterviewStage, string> =
  CANDIDATE_INTERVIEW_STAGE_LABELS;

export const feedbackStageLabels: Record<CandidateInterviewFeedbackStage, string> = {
  phone_screen: '电话沟通',
  first_interview: '一面',
  second_interview: '二面',
  final_interview: '终面',
};

export const feedbackDecisionLabels: Record<CandidateInterviewFeedbackDecision, string> = {
  pass: '通过',
  hold: '待定',
  reject: '淘汰',
};

export function needsInterviewFeedback(stage: CandidateInterviewStage) {
  return stage === 'phone_screen' || stage === 'interviewing';
}
