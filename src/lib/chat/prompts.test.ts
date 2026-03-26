import { buildSystemPrompt } from '@/lib/chat/prompts';

describe('chat prompt', () => {
  it('contains personality constraints', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('活泼开朗');
    expect(prompt).toContain('聪明敏锐');
    expect(prompt).toContain('同理心强');
    expect(prompt).toContain('主动发问');
  });

  it('does not set expert identity', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('不要自称任何领域专家');
    expect(prompt).toContain('不要自称');
  });
});
