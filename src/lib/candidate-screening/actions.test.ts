import {
  createActionIdempotencyKey,
  createDryRunActionPlan,
  plannedActionSequence,
} from './actions';

describe('candidate actions', () => {
  it('creates deterministic idempotency keys', () => {
    expect(
      createActionIdempotencyKey({
        userId: 'u1',
        runId: 'run-1',
        jobDescriptionId: 'jd1',
        candidateId: 'c1',
        platform: 'boss-like',
        action: 'chat',
      }),
    ).toBe(
      createActionIdempotencyKey({
        userId: 'u1',
        runId: 'run-1',
        jobDescriptionId: 'jd1',
        candidateId: 'c1',
        platform: 'boss-like',
        action: 'chat',
      }),
    );
  });

  it('scopes idempotency keys to a single screening run', () => {
    const firstRunKey = createActionIdempotencyKey({
      userId: 'u1',
      runId: 'run-1',
      jobDescriptionId: 'jd1',
      candidateId: 'c1',
      platform: 'boss-like',
      action: 'chat',
    });
    const rerunKey = createActionIdempotencyKey({
      userId: 'u1',
      runId: 'run-2',
      jobDescriptionId: 'jd1',
      candidateId: 'c1',
      platform: 'boss-like',
      action: 'chat',
    });

    expect(firstRunKey).not.toBe(rerunKey);
  });

  it('creates a dry-run chat message for recommended candidates', () => {
    const plan = createDryRunActionPlan({
      action: 'chat',
      priority: 'high',
      candidateName: '王小明',
      jobTitle: '高级后端工程师',
      reason: '技能匹配度高',
    });

    expect(plan.message).toContain('王小明');
    expect(plan.message).toContain('高级后端工程师');
  });

  it('plans collection after a chat greeting in the same browser workflow', () => {
    expect(plannedActionSequence('chat')).toEqual(['chat', 'collect']);
    expect(plannedActionSequence('collect')).toEqual(['collect']);
    expect(plannedActionSequence('skip')).toEqual([]);
  });
});
