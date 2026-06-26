import type { JDTone, JobSchema } from '@/types';

const DEFAULT_RESPONSIBILITIES = ['负责核心业务模块开发与迭代'];

function normalizeList(input: string): string[] {
  return input
    .split(/[，,、；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTitle(input: string): string {
  return input.replace(/^职位[:：]\s*/, '').trim() || '岗位待定';
}

export function parseJobInput(input: string, tone: JDTone = 'tech'): JobSchema {
  const trimmed = input.trim();
  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const title = normalizeTitle(lines[0] || '岗位待定');
  const combined = lines.join(' ');
  const skills = normalizeList(combined).slice(0, 8);

  return {
    title,
    seniority: combined.includes('高级') ? '高级' : '中级',
    skills: skills.length ? skills : ['TypeScript', 'React', 'Node.js'],
    responsibilities: DEFAULT_RESPONSIBILITIES,
    companyHighlights: ['核心业务岗位', '有清晰成长空间'],
    tone,
  };
}
