import {
  buildEvaluateUserPrompt,
  buildGenerateUserPrompt,
  buildImproveUserPrompt,
  PROMPT_VERSION,
} from '@/lib/jd-agent/prompts';
import type { EvaluationResult, JD, JobSchema } from '@/types';

const schema: JobSchema = {
  title: '高级前端工程师',
  seniority: '高级',
  skills: ['TypeScript', 'React'],
  responsibilities: ['负责核心模块开发'],
  companyHighlights: ['核心业务线'],
  tone: 'tech',
};

const jd: JD = {
  title: '高级前端工程师',
  summary: 'summary',
  responsibilities: ['r1'],
  requirements: ['q1'],
  bonus: [],
  highlights: ['h1'],
};

const evalResult: EvaluationResult = {
  scores: { clarity: 8, completeness: 8, attractiveness: 8, specificity: 8 },
  issues: ['issue1'],
  evidence: ['e1'],
  suggestions: ['s1'],
  rewrite_required: false,
};

describe('jd-agent prompts', () => {
  it('uses source prompt version', () => {
    expect(PROMPT_VERSION).toBe('jd_v3.2');
  });

  it('builds prompts with strict json constraints', async () => {
    expect(await buildGenerateUserPrompt(schema)).toContain('必须严格JSON');
    expect(await buildEvaluateUserPrompt(jd)).toContain('"rewrite_required"');
    expect(await buildImproveUserPrompt(jd, evalResult, '更专业')).toContain(
      '返回完整优化后的JSON JD',
    );
  });

  it('injects company context with grounding rules', async () => {
    const companyContext =
      '[knowledge source filename="company.md" chunkIndex=0]\n招聘助手服务 HR 团队，提供 AI 对话、知识库和 JD 生成能力。';

    const generatePrompt = await buildGenerateUserPrompt(schema, companyContext);
    const evaluatePrompt = await buildEvaluateUserPrompt(jd, companyContext);
    const improvePrompt = await buildImproveUserPrompt(jd, evalResult, '更专业', companyContext);

    expect(generatePrompt).toContain('公司上下文');
    expect(generatePrompt).toContain('不要编造');
    expect(generatePrompt).toContain('AI 对话、知识库和 JD 生成能力');
    expect(evaluatePrompt).toContain('公司上下文校验');
    expect(improvePrompt).toContain('AI 对话、知识库和 JD 生成能力');
  });
});
