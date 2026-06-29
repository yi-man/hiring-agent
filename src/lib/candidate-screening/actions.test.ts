import { createActionIdempotencyKey, createDryRunActionPlan } from './actions';

describe('candidate actions', () => {
  it('creates deterministic idempotency keys', () => {
    expect(
      createActionIdempotencyKey({
        userId: 'u1',
        jobDescriptionId: 'jd1',
        candidateId: 'c1',
        platform: 'boss-like',
        action: 'chat',
      }),
    ).toBe(
      createActionIdempotencyKey({
        userId: 'u1',
        jobDescriptionId: 'jd1',
        candidateId: 'c1',
        platform: 'boss-like',
        action: 'chat',
      }),
    );
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
});
