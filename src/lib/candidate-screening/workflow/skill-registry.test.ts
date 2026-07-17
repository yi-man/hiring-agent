import {
  buildBossLikeScreeningSkill,
  getActiveScreeningSkill,
  isCompatibleBossLikeScreeningSkill,
  isCompatibleScreeningSkill,
} from './skill-registry';
import { RECRUITMENT_PLATFORM_IDS } from '@/lib/recruitment-platforms';

function stepById(skill: ReturnType<typeof buildBossLikeScreeningSkill>, id: string) {
  const step = skill.steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`missing step: ${id}`);
  return step;
}

describe('boss-like screening workflow skill', () => {
  it('registers a compatible and distinct workflow for every platform', () => {
    const skills = RECRUITMENT_PLATFORM_IDS.map(getActiveScreeningSkill);
    expect(skills.map((skill) => skill.id)).toEqual([
      'boss-screen-candidates',
      'liepin-screen-candidates',
      'zhilian-screen-candidates',
      'boss-like-screen-candidates',
    ]);
    expect(skills.every(isCompatibleScreeningSkill)).toBe(true);
  });

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
      'observe',
      'click',
      'wait_for_snapshot_change',
      'observe',
      'navigate',
      'wait_for_text',
      'observe',
      'navigate',
      'click',
      'fill',
      'click',
      'wait_for_text',
      'navigate',
      'click',
    ]);
    expect(skill.meta).toMatchObject({ dsl_version: 'browser-v2', created_from: 'explore' });
    expect(stepById(skill, 'contact_wait_success')).toMatchObject({
      action: 'wait_for_text',
      params: { text: '消息已发送' },
      next: 'collect_open',
    });
    expect(stepById(skill, 'search_wait')).toMatchObject({
      action: 'wait_for_snapshot_change',
      params: {
        previousObservationKey: 'previousListHtml',
        previousUrl: '{{input.baseUrl}}/employer/resumes',
        readyChecks: expect.arrayContaining([
          expect.objectContaining({ type: 'dom_exists', selector: 'article[data-candidate-id]' }),
          expect.objectContaining({ type: 'text_contains', text: '暂无简历数据' }),
        ]),
      },
      next: 'search_observe',
    });
    expect(stepById(skill, 'search_snapshot_before_submit')).toMatchObject({
      action: 'observe',
      params: { format: 'html', saveAs: 'previousListHtml' },
      next: 'search_submit',
    });
    expect(new Set(actionSteps.map((step) => step.id)).size).toBe(20);
    expect(stepById(skill, 'auth_required')).toMatchObject({
      ifFalse: { next: 'search_fill' },
    });
    expect(stepById(skill, 'login_wait')).toMatchObject({
      next: 'search_fill',
    });
  });

  it('uses template inputs and one target per target-bearing primitive', () => {
    const skill = buildBossLikeScreeningSkill();

    expect(stepById(skill, 'search_fill')).toMatchObject({
      params: {
        target: expect.objectContaining({ name: '搜索候选人' }),
        value: '{{input.keyword}}',
      },
      next: 'search_snapshot_before_submit',
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

  it('rejects persisted workflows with stale page-completion semantics', () => {
    const current = buildBossLikeScreeningSkill();
    const stale = {
      ...current,
      id: 'screen-v5',
      version: 5,
      steps: current.steps.map((step) =>
        step.id === 'contact_wait_success' && step.type === 'action'
          ? {
              ...step,
              action: 'wait_for_url' as const,
              params: { url: '{{input.profileUrl}}/messages' },
            }
          : step,
      ),
    };

    expect(isCompatibleBossLikeScreeningSkill(current)).toBe(true);
    expect(isCompatibleBossLikeScreeningSkill(stale)).toBe(false);
  });

  it.each(['detail_observe', 'collect_click', 'action_complete'])(
    'rejects a browser-v2 workflow missing the required %s step',
    (missingStepId) => {
      const current = buildBossLikeScreeningSkill();
      const stale = {
        ...current,
        id: 'screen-v5',
        version: 5,
        steps: current.steps.filter((step) => step.id !== missingStepId),
      };

      expect(isCompatibleBossLikeScreeningSkill(stale)).toBe(false);
    },
  );

  it('rejects a structurally complete workflow with an unsafe detail navigation input', () => {
    const current = buildBossLikeScreeningSkill();
    const stale = {
      ...current,
      id: 'screen-v5',
      version: 5,
      steps: current.steps.map((step) =>
        step.id === 'detail_open' && step.type === 'action'
          ? { ...step, params: { url: 'https://stale.example.com/candidate' } }
          : step,
      ),
    };

    expect(isCompatibleBossLikeScreeningSkill(stale)).toBe(false);
  });
});
