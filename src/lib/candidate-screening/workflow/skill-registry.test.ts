import { buildBossLikeScreeningSkill } from './skill-registry';

describe('boss-like screening workflow skill', () => {
  it('builds a complete boss-like screening workflow', () => {
    const skill = buildBossLikeScreeningSkill();

    expect(skill).toEqual(
      expect.objectContaining({
        name: 'screen_candidates',
        platform: 'boss-like',
        version: 1,
        isActive: true,
      }),
    );
    expect(skill.steps.filter((step) => step.type === 'action').map((step) => step.action)).toEqual(
      [
        'ensure_login',
        'search_candidates',
        'enrich_candidate',
        'chat_candidate',
        'collect_candidate',
      ],
    );
  });

  it('groups neutral browser targets with each screening action', () => {
    const skill = buildBossLikeScreeningSkill();

    expect(skill.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ensure_login',
          params: {
            targets: expect.objectContaining({
              username: expect.objectContaining({ name: '用户名' }),
              password: expect.objectContaining({ name: '密码' }),
              loginButton: expect.objectContaining({ name: '登录' }),
            }),
          },
        }),
        expect.objectContaining({
          id: 'search_candidates',
          params: {
            targets: expect.objectContaining({
              searchInput: expect.objectContaining({ name: '搜索候选人' }),
              searchSubmit: expect.objectContaining({ name: '搜索' }),
            }),
          },
        }),
        expect.objectContaining({
          id: 'enrich_candidate',
          params: {
            targets: expect.objectContaining({
              detailContent: expect.objectContaining({ name: '候选人详情' }),
            }),
          },
        }),
        expect.objectContaining({
          id: 'chat_candidate',
          params: {
            targets: expect.objectContaining({
              greetButton: expect.objectContaining({ name: '打招呼' }),
              messageInput: expect.objectContaining({ name: '消息' }),
              sendButton: expect.objectContaining({ name: '发送' }),
            }),
          },
        }),
        expect.objectContaining({
          id: 'collect_candidate',
          params: {
            targets: expect.objectContaining({
              collectButton: expect.objectContaining({ name: '收藏' }),
            }),
          },
        }),
      ]),
    );
  });
});
