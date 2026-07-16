import {
  getAllowedCandidateInterviewStageTransitions,
  validateCandidateInterviewFeedbackStage,
  validateCandidateInterviewStageTransition,
} from './interview-stage';
import type { CandidateInterviewFeedbackDto } from './repo';

const now = '2026-07-15T00:00:00.000Z';

function feedback(
  stage: CandidateInterviewFeedbackDto['stage'],
  decision: CandidateInterviewFeedbackDto['decision'] = 'pass',
): CandidateInterviewFeedbackDto {
  return {
    id: `feedback-${stage}`,
    userId: 'u1',
    jobDescriptionId: 'jd-1',
    candidateId: 'cand-1',
    stage,
    interviewer: 'Grace Hopper',
    rating: 4,
    dimensionRatings: [],
    pros: [],
    cons: [],
    decision,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('candidate interview stage transitions', () => {
  it('allows only the configured next stages', () => {
    expect(getAllowedCandidateInterviewStageTransitions('contacted', [])).toEqual([
      'replied',
      'rejected',
      'withdrawn',
    ]);
    expect(validateCandidateInterviewStageTransition('contacted', 'phone_screen', [])).toEqual({
      ok: false,
      error: '不能从“已联系”直接推进到“电话沟通”',
    });
  });

  it('requires a passed phone screen before formal interviews', () => {
    expect(getAllowedCandidateInterviewStageTransitions('phone_screen', [])).not.toContain(
      'interviewing',
    );
    expect(
      getAllowedCandidateInterviewStageTransitions('phone_screen', [
        feedback('phone_screen', 'pass'),
      ]),
    ).toContain('interviewing');
  });

  it('requires all formal rounds to pass before completing the interview', () => {
    const incomplete = [
      feedback('phone_screen'),
      feedback('first_interview'),
      feedback('second_interview'),
    ];
    expect(getAllowedCandidateInterviewStageTransitions('interviewing', incomplete)).not.toContain(
      'interview_completed',
    );

    expect(
      getAllowedCandidateInterviewStageTransitions('interviewing', [
        ...incomplete,
        feedback('final_interview'),
      ]),
    ).toContain('interview_completed');
    expect(validateCandidateInterviewStageTransition('interview_completed', 'offer', [])).toEqual({
      ok: true,
    });
  });

  it('prevents feedback from skipping the candidate stage or interview order', () => {
    expect(validateCandidateInterviewFeedbackStage('contacted', 'final_interview', [])).toEqual({
      ok: false,
      error: '候选人当前处于“已联系”，不能新增终面评价',
    });
    expect(validateCandidateInterviewFeedbackStage('phone_screen', 'first_interview', [])).toEqual({
      ok: false,
      error: '当前应先完成电话沟通评价',
    });
    expect(
      validateCandidateInterviewFeedbackStage('interviewing', 'second_interview', [
        feedback('phone_screen'),
      ]),
    ).toEqual({ ok: false, error: '当前应先完成一面评价' });
    expect(
      validateCandidateInterviewFeedbackStage('interviewing', 'first_interview', [
        feedback('phone_screen'),
      ]),
    ).toEqual({ ok: true });
  });

  it('allows editing an existing feedback after the flow has advanced', () => {
    expect(
      validateCandidateInterviewFeedbackStage('offer', 'first_interview', [
        feedback('first_interview'),
      ]),
    ).toEqual({ ok: true });
  });
});
