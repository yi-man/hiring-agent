import { parseJobInput } from '@/lib/jd-agent/parser';

describe('parseJobInput', () => {
  it('parses first line as title', () => {
    const parsed = parseJobInput('高级前端工程师\nReact, TypeScript', 'tech');
    expect(parsed.title).toBe('高级前端工程师');
    expect(parsed.tone).toBe('tech');
    expect(parsed.skills.length).toBeGreaterThan(0);
  });
});
