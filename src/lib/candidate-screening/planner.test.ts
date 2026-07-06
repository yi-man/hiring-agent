import { buildScreeningPlanFromJd } from './planner';
import type { JobDescriptionDto } from '@/types';

const jd = {
  id: 'jd1',
  userId: 'u1',
  department: '技术部',
  position: '高级后端工程师',
  positionDescription: '负责 Java 微服务和高并发系统',
  salaryRange: null,
  workLocations: [],
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
});
