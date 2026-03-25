import { shouldUseMockLlm } from '@/lib/jd-agent/llm';

describe('shouldUseMockLlm', () => {
  it('uses mock in test environment', () => {
    expect(shouldUseMockLlm()).toBe(true);
  });
});
