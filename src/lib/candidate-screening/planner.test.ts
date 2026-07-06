import { buildScreeningPlanFromJd } from './planner';
import type { JobDescriptionDto } from '@/types';

const jd = {
  id: 'jd1',
  userId: 'u1',
  department: '技术部',
  position: '高级后端工程师',
  positionDescription: '负责 Java 微服务和高并发系统',
  tone: 'tech',
  status: 'published',
  content: {
    title: '高级后端工程师',
    summary: '负责交易链路',
    responsibilities: ['建设 Java 微服务', '优化高并发性能'],
    requirements: ['Java', 'Spring Boot', 'PostgreSQL'],
    bonus: ['消息队列'],
    highlights: ['核心系统'],
  },
  evaluation: null,
  generationMeta: null,
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
} satisfies JobDescriptionDto;

describe('candidate screening planner', () => {
  it('builds keywords, schema and retrieval query from a JD', () => {
    const result = buildScreeningPlanFromJd(jd);
    expect(result.searchPlan.keywords).toEqual(
      expect.arrayContaining(['高级后端工程师', 'Java', 'Spring Boot']),
    );
    expect(result.evaluationSchema.skills).toEqual(
      expect.arrayContaining(['Java', 'Spring Boot', 'PostgreSQL']),
    );
    expect(result.searchPlan.retrievalQuery).toContain('高级后端工程师');
  });

  it('extracts atomic boss-like search keywords from compound full-stack JD requirements', () => {
    const result = buildScreeningPlanFromJd({
      ...jd,
      position: '全栈工程师',
      positionDescription: '负责飞书团队的产品化，AI agent的开发。',
      content: {
        title: '全栈工程师（飞书团队·AI Agent方向）',
        summary: '负责产品化及AI agent的开发与迭代。',
        responsibilities: ['设计并实现AI agent逻辑与交互'],
        requirements: [
          '3年以上全栈开发经验',
          '精通React/Vue及Node.js',
          '熟悉Python或Java后端开发',
          '有AI/LLM应用开发经验',
          '掌握SQL及NoSQL数据库设计',
          '理解微服务与RESTful API',
        ],
        bonus: ['熟悉LangChain或类似AI框架'],
        highlights: ['技术挑战：高并发、复杂业务逻辑与AI推理的深度融合'],
      },
    });

    expect(result.searchPlan.keywords).toEqual(
      expect.arrayContaining([
        'React',
        'Vue',
        'Node.js',
        'Python',
        'Java',
        'AI',
        'LLM',
        'SQL',
        'NoSQL',
        '微服务',
        'RESTful API',
        'LangChain',
      ]),
    );
    expect(result.searchPlan.keywords.slice(0, 5)).toEqual([
      'React',
      'Vue',
      'Node.js',
      'Python',
      'Java',
    ]);
    expect(result.searchPlan.keywords).not.toEqual(
      expect.arrayContaining([
        '3年以上全栈开发经验',
        '精通React/Vue及Node.js',
        '熟悉Python或Java后端开发',
        '有AI/LLM应用开发经验',
        '掌握SQL及NoSQL数据库设计',
      ]),
    );
  });
});
