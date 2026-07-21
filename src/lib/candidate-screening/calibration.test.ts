import {
  buildCalibrationProfileFromJd,
  buildScoringQualityPolicy,
  inferCalibrationCategoryFromJd,
} from './calibration';
import {
  CANDIDATE_EVALUATION_PROMPT_VERSION,
  CANDIDATE_SCREENING_CALIBRATION_VERSION,
  CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
  CANDIDATE_SCREENING_SCORING_VERSION,
} from './constants';
import type { JobDescriptionDto } from '@/types';

function makeJd(overrides: Partial<JobDescriptionDto> = {}): JobDescriptionDto {
  return {
    id: 'jd-calibration',
    userId: 'user-1',
    department: '技术部',
    position: '后端工程师',
    positionDescription: '负责 Java 微服务开发',
    salaryRange: null,
    workLocations: [],
    hiringTarget: 1,
    onboardedCount: 0,
    tone: 'formal',
    status: 'published',
    content: {
      title: '后端工程师',
      summary: '负责交易系统建设',
      responsibilities: ['建设 Java 服务'],
      requirements: ['Java', 'Spring Boot'],
      highlights: ['核心系统'],
      bonus: ['高并发经验'],
    },
    evaluation: null,
    generationMeta: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('candidate screening calibration', () => {
  it('infers calibration categories from role-specific JD text', () => {
    expect(inferCalibrationCategoryFromJd(makeJd())).toBe('technical');
    expect(
      inferCalibrationCategoryFromJd(
        makeJd({
          department: '数据智能部',
          position: 'AI 算法工程师',
          positionDescription: '负责 LLM 应用、RAG 和模型评估',
        }),
      ),
    ).toBe('data_ai');
    expect(
      inferCalibrationCategoryFromJd(
        makeJd({
          department: '设计部',
          position: '高级 UX 设计师',
          positionDescription: '负责交互设计、用户体验和设计系统',
        }),
      ),
    ).toBe('design');
  });

  it('builds compact role-specific anchors for LLM scoring calibration', () => {
    const profile = buildCalibrationProfileFromJd(makeJd());

    expect(profile).toMatchObject({
      version: CANDIDATE_SCREENING_CALIBRATION_VERSION,
      category: 'technical',
      categoryLabel: '技术研发',
    });
    expect(profile.anchors).toHaveLength(4);
    expect(profile.anchors[0]).toMatchObject({
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
    });
    expect(profile.reviewSampling).toEqual(
      expect.arrayContaining(['每次运行抽查最高分、60-75 边界分、低分但向量匹配高的候选人']),
    );
  });

  it('exposes a versioned low-cost iteration policy', () => {
    expect(buildScoringQualityPolicy()).toMatchObject({
      version: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
      promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
      scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
      calibrationVersion: CANDIDATE_SCREENING_CALIBRATION_VERSION,
      regressionTiers: expect.arrayContaining([
        expect.objectContaining({ name: 'replay', llmCalls: 'none' }),
        expect.objectContaining({ name: 'golden-sample', llmCalls: 'small-sample' }),
      ]),
    });
  });
});
