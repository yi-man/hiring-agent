import { buildBossLikeJobPayload, parsePublishJobDescriptionPayload } from './publish-payload';
import type { JobDescriptionDto } from '@/types';

const sampleJobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'user-1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责增长业务体验建设',
  tone: 'tech',
  status: 'ready_to_publish',
  content: {
    title: '高级前端工程师',
    summary: '负责招聘产品的前端体验与工程质量。',
    responsibilities: ['建设核心发布流程', '优化候选人沟通体验'],
    requirements: ['熟悉 TypeScript', '有复杂表单经验'],
    bonus: ['有 Playwright 自动化经验'],
    highlights: ['业务上下文清晰', '技术栈现代'],
  },
  evaluation: null,
  generationMeta: null,
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
};

describe('JD publish payload helpers', () => {
  it('parses boss-like publish settings with trimmed fields and optional keywords', () => {
    expect(
      parsePublishJobDescriptionPayload({
        platform: 'boss-like',
        company: '  星河智能  ',
        salary: ' 25-40K ',
        location: ' 上海 ',
        keywords: [' TypeScript ', '', 'React'],
      }),
    ).toEqual({
      ok: true,
      value: {
        platform: 'boss-like',
        company: '星河智能',
        salary: '25-40K',
        location: '上海',
        keywords: ['TypeScript', 'React'],
      },
    });
  });

  it('rejects unsupported platform and missing required publish settings', () => {
    expect(parsePublishJobDescriptionPayload({ platform: 'boss' })).toEqual({
      ok: false,
      error: 'platform is unsupported',
    });
    expect(parsePublishJobDescriptionPayload({ platform: 'boss-like', company: 'x' })).toEqual({
      ok: false,
      error: 'salary is required',
    });
  });

  it('maps a generated JD into the boss-like job form payload', () => {
    const payload = buildBossLikeJobPayload(sampleJobDescription, {
      platform: 'boss-like',
      company: '星河智能',
      salary: '25-40K',
      location: '上海',
      keywords: ['TypeScript', 'React'],
    });

    expect(payload).toMatchObject({
      title: '高级前端工程师',
      company: '星河智能',
      salary: '25-40K',
      location: '上海',
      keywords: ['TypeScript', 'React'],
    });
    expect(payload.description).toContain('负责招聘产品的前端体验与工程质量。');
    expect(payload.description).toContain('岗位职责');
    expect(payload.description).toContain('- 建设核心发布流程');
    expect(payload.description).toContain('任职要求');
    expect(payload.description).toContain('- 熟悉 TypeScript');
    expect(payload.description).toContain('加分项');
    expect(payload.description).toContain('岗位亮点');
  });
});
