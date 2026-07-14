import { buildBossLikeScreeningSkill } from './skill-registry';

function stepById(skill: ReturnType<typeof buildBossLikeScreeningSkill>, id: string) {
  const step = skill.steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`missing step: ${id}`);
  return step;
}

describe('boss-like screening workflow skill', () => {
  it('builds one browser-v2 primitive screening graph', () => {
    const skill = buildBossLikeScreeningSkill();
    const actionSteps = skill.steps.filter((step) => step.type === 'action');

    expect(skill).toEqual(
      expect.objectContaining({
        name: 'screen_candidates',
        platform: 'boss-like',
        version: 1,
        isActive: true,
      }),
    );
    expect(actionSteps.map((step) => step.action)).toEqual([
      'navigate',
      'fill',
      'fill',
      'click',
      'wait_for_url',
      'fill',
      'click',
      'wait_for_url',
      'observe',
      'navigate',
      'wait_for_text',
      'observe',
      'navigate',
      'click',
      'fill',
      'click',
      'wait_for_url',
      'navigate',
      'click',
    ]);
    expect(skill.meta).toMatchObject({ dsl_version: 'browser-v2', created_from: 'explore' });
    expect(stepById(skill, 'contact_wait_success')).toMatchObject({
      action: 'wait_for_url',
      params: { url: '{{input.profileUrl}}/messages' },
      next: 'collect_open',
    });
    expect(stepById(skill, 'search_wait')).toMatchObject({
      action: 'wait_for_url',
      params: { url: '{{input.searchUrl}}' },
      next: 'search_observe',
    });
    expect(new Set(actionSteps.map((step) => step.id)).size).toBe(19);
    expect(stepById(skill, 'auth_required')).toMatchObject({
      ifFalse: { next: 'search_fill' },
    });
    expect(stepById(skill, 'login_wait')).toMatchObject({ next: 'search_fill' });
  });

  it('uses template inputs and one target per target-bearing primitive', () => {
    const skill = buildBossLikeScreeningSkill();

    expect(stepById(skill, 'search_fill')).toMatchObject({
      params: {
        target: expect.objectContaining({ name: '搜索候选人' }),
        value: '{{input.keyword}}',
      },
      next: 'search_submit',
    });
    expect(stepById(skill, 'detail_open')).toMatchObject({
      params: { url: '{{input.profileUrl}}' },
      next: 'detail_wait',
    });
    expect(stepById(skill, 'contact_fill_message')).toMatchObject({
      params: {
        target: expect.objectContaining({ name: '消息' }),
        value: '{{input.message}}',
      },
      next: 'contact_send',
    });
    expect(stepById(skill, 'collect_open')).toMatchObject({ next: 'collect_click' });
  });
});
