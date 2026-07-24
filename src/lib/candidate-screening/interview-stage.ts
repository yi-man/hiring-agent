import type { CandidateInterviewFeedbackDto } from './repo';
import { CANDIDATE_INTERVIEW_STAGE_LABELS } from './constants';
import type { CandidateInterviewFeedbackStage, CandidateInterviewStage } from './types';
import { getFormalInterviewStages, PHONE_SCREEN_STAGE } from '@/lib/interviews/process';
import type { InterviewProcessStage } from '@/lib/interviews/types';

const baseTransitions: Record<CandidateInterviewStage, readonly CandidateInterviewStage[]> = {
  sourced: ['screened', 'withdrawn'],
  screened: ['to_contact', 'collected', 'rejected', 'withdrawn'],
  to_contact: ['collected', 'contacted', 'rejected', 'withdrawn'],
  collected: ['contacted', 'rejected', 'withdrawn'],
  contacted: ['replied', 'rejected', 'withdrawn'],
  replied: ['phone_screen', 'rejected', 'withdrawn'],
  phone_screen: ['interviewing', 'rejected', 'withdrawn'],
  interviewing: ['interview_completed', 'rejected', 'withdrawn'],
  interview_completed: ['offer', 'rejected', 'withdrawn'],
  offer: ['onboarded', 'not_joined', 'withdrawn'],
  onboarded: ['not_joined'],
  not_joined: ['onboarded'],
  rejected: [],
  withdrawn: [],
};

function hasPassedFeedback(
  feedbacks: CandidateInterviewFeedbackDto[],
  stage: CandidateInterviewFeedbackDto['stage'],
) {
  return feedbacks.some((feedback) => feedback.stage === stage && feedback.decision === 'pass');
}

function evidenceAllowsTransition(
  current: CandidateInterviewStage,
  next: CandidateInterviewStage,
  feedbacks: CandidateInterviewFeedbackDto[],
  formalInterviewStages: readonly InterviewProcessStage[],
) {
  if (current === 'phone_screen' && next === 'interviewing') {
    return hasPassedFeedback(feedbacks, 'phone_screen');
  }
  if (current === 'interviewing' && next === 'interview_completed') {
    return formalInterviewStages.every((stage) => hasPassedFeedback(feedbacks, stage.id));
  }
  return true;
}

export function getAllowedCandidateInterviewStageTransitions(
  current: CandidateInterviewStage,
  feedbacks: CandidateInterviewFeedbackDto[],
  formalInterviewStages: readonly InterviewProcessStage[] = getFormalInterviewStages(null),
): CandidateInterviewStage[] {
  return baseTransitions[current].filter((next) =>
    evidenceAllowsTransition(current, next, feedbacks, formalInterviewStages),
  );
}

export function validateCandidateInterviewStageTransition(
  current: CandidateInterviewStage,
  next: CandidateInterviewStage,
  feedbacks: CandidateInterviewFeedbackDto[],
  formalInterviewStages: readonly InterviewProcessStage[] = getFormalInterviewStages(null),
): { ok: true } | { ok: false; error: string } {
  if (current === next) return { ok: true };
  if (!baseTransitions[current].includes(next)) {
    return {
      ok: false,
      error: `不能从“${CANDIDATE_INTERVIEW_STAGE_LABELS[current]}”直接推进到“${CANDIDATE_INTERVIEW_STAGE_LABELS[next]}”`,
    };
  }
  if (current === 'phone_screen' && next === 'interviewing') {
    if (!hasPassedFeedback(feedbacks, 'phone_screen')) {
      return { ok: false, error: '电话沟通评价通过后才能进入面试中' };
    }
  }
  if (current === 'interviewing' && next === 'interview_completed') {
    if (!formalInterviewStages.every((stage) => hasPassedFeedback(feedbacks, stage.id))) {
      return {
        ok: false,
        error: `${formalInterviewStages.map((stage) => stage.name).join('、')}均评价通过后才能完成面试`,
      };
    }
  }
  return { ok: true };
}

export function validateCandidateInterviewFeedbackStage(
  current: CandidateInterviewStage,
  stage: CandidateInterviewFeedbackStage,
  feedbacks: CandidateInterviewFeedbackDto[],
  formalInterviewStages: readonly InterviewProcessStage[] = getFormalInterviewStages(null),
): { ok: true } | { ok: false; error: string } {
  if (feedbacks.some((feedback) => feedback.stage === stage)) return { ok: true };

  if (current === 'phone_screen') {
    return stage === PHONE_SCREEN_STAGE.id
      ? { ok: true }
      : { ok: false, error: '当前应先完成电话沟通评价' };
  }

  if (current === 'interviewing') {
    const completed = new Set(feedbacks.map((feedback) => feedback.stage));
    const requiredStages = [PHONE_SCREEN_STAGE, ...formalInterviewStages];
    const pendingStage = requiredStages.find((candidateStage) => !completed.has(candidateStage.id));
    if (stage === pendingStage?.id) return { ok: true };
    return {
      ok: false,
      error: pendingStage ? `当前应先完成${pendingStage.name}评价` : '所有面试评价均已完成',
    };
  }

  return {
    ok: false,
    error: `候选人当前处于“${CANDIDATE_INTERVIEW_STAGE_LABELS[current]}”，不能新增${[PHONE_SCREEN_STAGE, ...formalInterviewStages].find((item) => item.id === stage)?.name ?? stage}评价`,
  };
}
