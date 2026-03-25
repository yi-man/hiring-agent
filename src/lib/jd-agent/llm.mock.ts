import type { EvaluationResult, JD } from '@/types';

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, value));
}

export function mockGenerateJD(seedTitle: string): JD {
  return {
    title: seedTitle || '高级前端工程师',
    summary:
      '该岗位负责核心产品体验迭代与工程质量建设，参与关键业务增长场景，推动高质量交付与技术升级。',
    responsibilities: [
      '负责核心页面与交互开发',
      '推进前端工程化与规范落地',
      '与产品设计协作优化体验',
      '参与性能优化与稳定性建设',
      '支持关键业务需求快速交付',
    ],
    requirements: [
      '3年以上前端开发经验',
      '熟悉 TypeScript 与 React',
      '具备复杂交互实现能力',
      '有性能优化实战经验',
      '具备良好沟通协作能力',
    ],
    bonus: ['有 ToB 或增长业务经验', '熟悉 Node.js 服务端开发'],
    highlights: ['核心业务线', '技术挑战明确', '成长路径清晰'],
  };
}

export function mockEvaluateJD(jd: JD): EvaluationResult {
  const hasEmptyTalk = JSON.stringify(jd).includes('相关工作');
  const base = hasEmptyTalk ? 6 : 8;
  return {
    scores: {
      clarity: clampScore(base),
      completeness: clampScore(base + 1),
      attractiveness: clampScore(base),
      specificity: clampScore(base - (hasEmptyTalk ? 1 : 0)),
    },
    issues: hasEmptyTalk
      ? ['存在空话表达，需要替换为具体场景']
      : ['亮点描述可进一步量化', '部分职责可增加业务目标', '可补充跨团队协作边界'],
    evidence: hasEmptyTalk ? ['出现“相关工作”表达'] : ['职责项包含笼统表述'],
    suggestions: ['补充技术场景与业务目标', '删除空话并改为可执行描述'],
    rewrite_required: hasEmptyTalk,
  };
}

export function mockImproveJD(jd: JD, extraInstruction: string): JD {
  const enrichedSummary = extraInstruction
    ? `${jd.summary} 另外根据要求：${extraInstruction}。`
    : `${jd.summary} 强化了岗位价值与业务场景描述。`;

  return {
    ...jd,
    summary: enrichedSummary,
    highlights: Array.from(new Set([...jd.highlights, '岗位价值表达更具体'])).slice(0, 5),
  };
}
