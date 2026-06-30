import {
  CANDIDATE_SCREENING_DECISION_ACTIONS,
  CANDIDATE_SCREENING_INTERVIEW_STAGES,
  CANDIDATE_SCREENING_RUN_STAGES,
} from './constants';
import {
  parseCreateScreeningRunPayload,
  parseExecuteActionsPayload,
  parseUpdateCandidateProgressPayload,
} from './api';

describe('candidate screening API parsing', () => {
  it('parses a default dry-run create request', () => {
    expect(parseCreateScreeningRunPayload({ platform: 'boss-like' })).toEqual({
      ok: true,
      value: {
        platform: 'boss-like',
        mode: 'dry_run',
        maxCandidates: 50,
        batchSize: 10,
        allowAlreadyContacted: false,
      },
    });
  });

  it('rejects unsupported platform and unsafe limits', () => {
    expect(parseCreateScreeningRunPayload({ platform: 'x' })).toEqual({
      ok: false,
      error: 'platform is invalid',
    });
    expect(parseCreateScreeningRunPayload({ platform: 'boss-like', maxCandidates: 501 })).toEqual({
      ok: false,
      error: 'maxCandidates must be between 1 and 200',
    });
  });

  it('requires explicit execution confirmation', () => {
    expect(parseExecuteActionsPayload({ confirmExecution: false })).toEqual({
      ok: false,
      error: 'confirmExecution must be true',
    });
    expect(parseExecuteActionsPayload({ confirmExecution: true })).toEqual({
      ok: true,
      value: { confirmExecution: true, maxChatActions: 10, maxCollectActions: 30 },
    });
  });

  it('parses interview progress updates', () => {
    expect(
      parseUpdateCandidateProgressPayload({ interviewStage: 'phone_screen', notes: '约电话' }),
    ).toEqual({
      ok: true,
      value: { interviewStage: 'phone_screen', notes: '约电话' },
    });
    expect(parseUpdateCandidateProgressPayload({ interviewStage: 'unknown' })).toEqual({
      ok: false,
      error: 'interviewStage is invalid',
    });
  });

  it('exports stable stage and decision constants', () => {
    expect(CANDIDATE_SCREENING_RUN_STAGES).toContain('searching_live');
    expect(CANDIDATE_SCREENING_INTERVIEW_STAGES).toContain('interviewing');
    expect(CANDIDATE_SCREENING_DECISION_ACTIONS).toEqual(['chat', 'collect', 'skip']);
  });
});
