import type {
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
  CandidateInterviewStage,
} from '@/lib/candidate-screening/types';

export const interviewStageLabels: Record<CandidateInterviewStage, string> = {
  sourced: '已发现',
  screened: '已筛选',
  to_contact: '待联系',
  collected: '已收藏',
  contacted: '已联系',
  replied: '已回复',
  phone_screen: '电话沟通',
  interviewing: '面试中',
  interview_completed: '面试完成',
  offer: 'Offer 阶段',
  rejected: '已淘汰',
  withdrawn: '已退出',
};

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
