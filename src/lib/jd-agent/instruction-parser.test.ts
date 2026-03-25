import { resolveInstruction } from '@/lib/jd-agent/instruction-parser';

describe('resolveInstruction', () => {
  it('prefers explicit input instruction', () => {
    const result = resolveInstruction('加强吸引力', '#指令: 忽略我');
    expect(result.instruction).toBe('加强吸引力');
    expect(result.source).toBe('input');
  });

  it('parses #指令 from content', () => {
    const result = resolveInstruction(undefined, '#指令: 更专业一点\n{"title":"a"}');
    expect(result.instruction).toBe('更专业一点');
    expect(result.source).toBe('inline');
  });
});
