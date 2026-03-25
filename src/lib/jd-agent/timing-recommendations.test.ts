import { buildTimingSuggestions } from './timing-recommendations';

describe('buildTimingSuggestions', () => {
  it('flags long total duration', () => {
    const stages = [
      { id: 'generate', label: '生成 JD', ms: 60_000 },
      { id: 'evaluate', label: '评估 JD', ms: 70_000 },
    ];
    const out = buildTimingSuggestions(stages, 130_000, {
      didImprovePath: false,
      action: 'initial_generate',
    });
    expect(out.some((s) => s.includes('总耗时'))).toBe(true);
  });

  it('flags bottleneck stage', () => {
    const stages = [
      { id: 'generate', label: '生成 JD', ms: 10_000 },
      { id: 'evaluate', label: '评估 JD', ms: 90_000 },
    ];
    const out = buildTimingSuggestions(stages, 100_000, {
      didImprovePath: false,
      action: 'initial_generate',
    });
    expect(out.some((s) => s.includes('评估 JD') || s.includes('主要耗时'))).toBe(true);
  });

  it('mentions full pipeline when many LLM calls', () => {
    const stages = [
      { id: 'generate', label: '生成 JD', ms: 20_000 },
      { id: 'evaluate', label: '评估 JD', ms: 20_000 },
      { id: 'improve', label: '改写 JD', ms: 20_000 },
      { id: 'reevaluate', label: '改写后再评估', ms: 20_000 },
    ];
    const out = buildTimingSuggestions(stages, 80_000, {
      didImprovePath: true,
      action: 'initial_generate',
    });
    expect(out.some((s) => s.includes('4 次'))).toBe(true);
  });
});
