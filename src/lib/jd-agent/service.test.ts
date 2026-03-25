import { runJDAgent } from '@/lib/jd-agent/service';

describe('runJDAgent', () => {
  it('runs initial_generate flow', async () => {
    const result = await runJDAgent({
      action: 'initial_generate',
      jobInput: '高级前端工程师，负责增长业务',
      tone: 'tech',
    });

    expect(result.jd.title).toBeTruthy();
    expect(result.meta.promptVersion).toBe('jd_v3.2');
    expect(result.meta.timing?.stages.length).toBeGreaterThan(0);
    expect(result.meta.timing?.totalMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.meta.timing?.suggestions)).toBe(true);
    expect(result.meta.tokens?.total.totalTokens).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.meta.tokens?.stages)).toBe(true);
  });

  it('runs continue_generate flow', async () => {
    const result = await runJDAgent({
      action: 'continue_generate',
      currentJd: {
        title: '高级前端工程师',
        summary: 'summary',
        responsibilities: ['r1'],
        requirements: ['q1'],
        bonus: [],
        highlights: ['h1'],
      },
      extraInstruction: '更专业一些',
    });

    expect(result.decision.improved).toBe(true);
  });
});
